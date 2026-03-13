import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "../src/app/api/planning/v3/news/weekly-plan/route";
import { resolveWeeklyPlanPath } from "../planning/v3/news/weeklyPlan";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalPlanningDataDir = env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function weeklyPlanPath(): string {
  return resolveWeeklyPlanPath();
}

function requestGet(pathname: string, host = LOCAL_HOST, withOriginHeaders = false): Request {
  const origin = `http://${host}`;
  const headers = new Headers({ host });
  if (withOriginHeaders) {
    headers.set("origin", origin);
    headers.set("referer", `${origin}/planning/v3/news`);
  }
  return new Request(`${origin}${pathname}`, {
    method: "GET",
    headers,
  });
}

function requestPost(pathname: string, body: unknown, cookie = "dev_csrf=csrf-token"): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/news`,
    "content-type": "application/json",
  });
  if (cookie) {
    headers.set("cookie", cookie);
  }

  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function backupWeeklyPlanFile(): string | null {
  const filePath = weeklyPlanPath();
  if (!fs.existsSync(filePath)) return null;
  const backup = `${filePath}.backup-test`;
  fs.rmSync(backup, { force: true });
  fs.renameSync(filePath, backup);
  return backup;
}

function restoreWeeklyPlanFile(backup: string | null): void {
  fs.rmSync(weeklyPlanPath(), { force: true });
  if (!backup) return;
  fs.mkdirSync(path.dirname(weeklyPlanPath()), { recursive: true });
  fs.renameSync(backup, weeklyPlanPath());
}

describe("planning v3 news weekly plan api", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-news-weekly-plan-api-"));
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

  it("allows same-origin remote host", async () => {
    const response = await GET(requestGet("/api/planning/v3/news/weekly-plan", "example.com", true));
    const payload = await response.json() as { ok?: boolean; data?: unknown };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
  });

  it("supports explicit save with same-origin/csrf guard", async () => {
    const backup = backupWeeklyPlanFile();
    try {
      const denied = await POST(requestPost("/api/planning/v3/news/weekly-plan", {
        csrf: "csrf-token",
        topics: ["rates"],
        seriesIds: ["KR_BOK_BASE_RATE"],
      }, "dev_csrf=csrf-cookie"));
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

      const response = await GET(requestGet("/api/planning/v3/news/weekly-plan", LOCAL_HOST, true));
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
