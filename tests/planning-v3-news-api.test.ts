import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runScriptMock } = vi.hoisted(() => ({
  runScriptMock: vi.fn(),
}));

vi.mock("../src/lib/dev/runScript", async () => {
  const actual = await vi.importActual("../src/lib/dev/runScript");
  return {
    ...(actual as object),
    runScript: (...args: unknown[]) => runScriptMock(...args),
  };
});

import { GET as digestGET } from "../src/app/api/planning/v3/news/digest/route";
import { POST as refreshPOST } from "../src/app/api/planning/v3/news/refresh/route";
import { GET as scenariosGET } from "../src/app/api/planning/v3/news/scenarios/route";
import { GET as trendsGET } from "../src/app/api/planning/v3/news/trends/route";
import {
  resolveNewsDigestDayJsonPath,
  resolveNewsScenarioJsonPath,
  resolveNewsTrendsJsonPath,
} from "../src/lib/news/storageSqlite";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

const DIGEST_PATH = resolveNewsDigestDayJsonPath();
const TRENDS_PATH = resolveNewsTrendsJsonPath();
const SCENARIOS_PATH = resolveNewsScenarioJsonPath();

function requestGet(pathname: string, host = LOCAL_HOST, withOriginHeaders = false): Request {
  const origin = `http://${host}`;
  const headers = new Headers({ host });
  if (withOriginHeaders) {
    headers.set("origin", origin);
    headers.set("referer", `${origin}/planning/v3/news`);
  }
  return new Request(`${origin}${pathname}`, { method: "GET", headers });
}

function requestPost(body: unknown, withAuth = true): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/news`,
    "content-type": "application/json",
  });
  if (withAuth) {
    headers.set("cookie", "dev_action=1; dev_csrf=csrf-token");
  }
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/news/refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
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

describe("planning v3 news api", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    runScriptMock.mockReset();
    runScriptMock.mockResolvedValue({
      ok: true,
      tookMs: 15,
      stdoutTail: "news refresh done",
      stderrTail: "",
    });
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("GET digest/trends/scenarios returns ok:true data:null when files are missing", async () => {
    const digestBackup = backupAndRemove(DIGEST_PATH);
    const trendsBackup = backupAndRemove(TRENDS_PATH);
    const scenariosBackup = backupAndRemove(SCENARIOS_PATH);

    try {
      const digest = await digestGET(requestGet("/api/planning/v3/news/digest"));
      const digestJson = await digest.json() as { ok?: boolean; data?: unknown };
      expect(digest.status).toBe(200);
      expect(digestJson.ok).toBe(true);
      expect(digestJson.data).toBeNull();

      const trends = await trendsGET(requestGet("/api/planning/v3/news/trends?window=30"));
      const trendsJson = await trends.json() as { ok?: boolean; windowDays?: number; data?: unknown };
      expect(trends.status).toBe(200);
      expect(trendsJson.ok).toBe(true);
      expect(trendsJson.windowDays).toBe(30);
      expect(trendsJson.data).toBeNull();

      const scenarios = await scenariosGET(requestGet("/api/planning/v3/news/scenarios"));
      const scenariosJson = await scenarios.json() as { ok?: boolean; data?: unknown };
      expect(scenarios.status).toBe(200);
      expect(scenariosJson.ok).toBe(true);
      expect(scenariosJson.data).toBeNull();
    } finally {
      restoreFile(DIGEST_PATH, digestBackup);
      restoreFile(TRENDS_PATH, trendsBackup);
      restoreFile(SCENARIOS_PATH, scenariosBackup);
    }
  });

  it("GET routes block non-local host", async () => {
    const response = await digestGET(requestGet("/api/planning/v3/news/digest", "example.com"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("GET digest response only exposes whitelisted metadata fields", async () => {
    const digestBackup = backupAndRemove(DIGEST_PATH);
    try {
      fs.mkdirSync(path.dirname(DIGEST_PATH), { recursive: true });
      fs.writeFileSync(DIGEST_PATH, `${JSON.stringify({
        date: "2026-03-04",
        generatedAt: "2026-03-04T00:00:00.000Z",
        topItems: [
          {
            topicId: "rates",
            topicLabel: "금리",
            title: "Sample title",
            url: "https://example.com/sample",
            score: 1.2,
            publishedAt: "2026-03-04T00:00:00.000Z",
            sourceName: "source",
            snippet: "sample snippet",
            fullText: "must never leak",
          },
        ],
        topTopics: [],
        burstTopics: [],
        watchlist: [],
        scenarioCards: [],
        summary: { observation: "obs", evidenceLinks: [], watchVariables: [], counterSignals: [] },
      }, null, 2)}\n`, "utf-8");

      const response = await digestGET(requestGet("/api/planning/v3/news/digest"));
      const payload = await response.json() as { ok?: boolean; data?: { topItems?: Array<Record<string, unknown>> } | null };
      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      const first = payload.data?.topItems?.[0] ?? {};
      expect(first.title).toBe("Sample title");
      expect(first.url).toBe("https://example.com/sample");
      expect(first.snippet).toBe("sample snippet");
      expect("fullText" in first).toBe(false);
    } finally {
      restoreFile(DIGEST_PATH, digestBackup);
    }
  });

  it("POST refresh blocks when dev unlock/csrf context is missing", async () => {
    const response = await refreshPOST(requestPost({ csrf: "csrf-token" }, false));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("UNAUTHORIZED");
    expect(runScriptMock).not.toHaveBeenCalled();
  });

  it("POST refresh runs pnpm news:refresh with valid guard context", async () => {
    const response = await refreshPOST(requestPost({ csrf: "csrf-token" }));
    const payload = await response.json() as { ok?: boolean; tookMs?: number };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(typeof payload.tookMs).toBe("number");
    expect(runScriptMock).toHaveBeenCalledTimes(1);
    expect(runScriptMock).toHaveBeenCalledWith({
      command: "pnpm",
      args: ["news:refresh"],
      timeoutMs: 120000,
    });
  });
});
