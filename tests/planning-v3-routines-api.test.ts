import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "../src/app/api/planning/v3/routines/daily/route";

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

function requestPost(pathname: string, body: unknown, withAuth = true): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/journal`,
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

describe("planning v3 routines api", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-v3-routines-api-"));
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

  it("blocks non-local host for GET", async () => {
    const response = await GET(requestGet("/api/planning/v3/routines/daily?date=2026-03-05", "example.com"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("requires csrf/auth for POST", async () => {
    const response = await POST(requestPost("/api/planning/v3/routines/daily", {
      checklist: { date: "2026-03-05", items: [] },
    }, false));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("UNAUTHORIZED");
  });

  it("saves and reads checklist linked by date", async () => {
    const save = await POST(requestPost("/api/planning/v3/routines/daily", {
      csrf: "csrf-token",
      checklist: {
        date: "2026-03-05",
        items: [
          { id: "refresh_news", checked: true },
          { id: "write_journal", checked: true },
        ],
      },
    }));
    const savedPayload = await save.json() as {
      ok?: boolean;
      checklist?: { date?: string; items?: Array<{ id?: string; checked?: boolean }> };
    };
    expect(save.status).toBe(200);
    expect(savedPayload.ok).toBe(true);
    expect(savedPayload.checklist?.date).toBe("2026-03-05");
    expect(savedPayload.checklist?.items?.find((row) => row.id === "refresh_news")?.checked).toBe(true);

    const read = await GET(requestGet("/api/planning/v3/routines/daily?date=2026-03-05"));
    const readPayload = await read.json() as {
      ok?: boolean;
      checklist?: { date?: string; savedAt?: string | null; items?: Array<{ id?: string; checked?: boolean }> };
    };
    expect(read.status).toBe(200);
    expect(readPayload.ok).toBe(true);
    expect(readPayload.checklist?.date).toBe("2026-03-05");
    expect(typeof readPayload.checklist?.savedAt).toBe("string");
    expect(readPayload.checklist?.items?.find((row) => row.id === "write_journal")?.checked).toBe(true);
  });
});
