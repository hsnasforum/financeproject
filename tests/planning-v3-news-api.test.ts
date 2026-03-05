import fs from "node:fs";
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

import { GET as digestGET } from "../src/app/api/planning/v3/news/digest/route";
import { GET as itemsGET } from "../src/app/api/planning/v3/news/items/route";
import { POST as refreshPOST } from "../src/app/api/planning/v3/news/refresh/route";
import { GET as scenariosGET } from "../src/app/api/planning/v3/news/scenarios/route";
import { GET as settingsGET, POST as settingsPOST } from "../src/app/api/planning/v3/news/settings/route";
import { GET as todayGET } from "../src/app/api/planning/v3/news/today/route";
import { GET as trendsGET } from "../src/app/api/planning/v3/news/trends/route";
import {
  closeNewsDatabase,
  openNewsDatabase,
  resolveNewsDbPath,
  resolveNewsDigestDayJsonPath,
  resolveNewsScenarioJsonPath,
  resolveNewsTrendsJsonPath,
} from "../src/lib/news/storageSqlite";
import { resolveNewsSettingsPath } from "../planning/v3/news/settings";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

const DIGEST_PATH = resolveNewsDigestDayJsonPath();
const TRENDS_PATH = resolveNewsTrendsJsonPath();
const SCENARIOS_PATH = resolveNewsScenarioJsonPath();
const SETTINGS_PATH = resolveNewsSettingsPath();
const DB_PATH = resolveNewsDbPath();

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

function requestSettingsPost(body: unknown, withAuth = true): Request {
  const headers = new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}/planning/v3/news/settings`,
    "content-type": "application/json",
  });
  if (withAuth) {
    headers.set("cookie", "dev_action=1; dev_csrf=csrf-token");
  }
  return new Request(`${LOCAL_ORIGIN}/api/planning/v3/news/settings`, {
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
    runNewsRefreshMock.mockReset();
    runNewsRefreshMock.mockResolvedValue({
      sourcesProcessed: 2,
      itemsFetched: 10,
      itemsNew: 3,
      itemsDeduped: 7,
      errors: [],
    });
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("GET digest/scenarios returns null when artifacts are missing and trends remains readable", async () => {
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
      if (trendsJson.data !== null) {
        expect(typeof trendsJson.data).toBe("object");
      }

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

  it("GET scenarios enriches personalImpact/stress fields", async () => {
    const scenariosBackup = backupAndRemove(SCENARIOS_PATH);
    try {
      fs.mkdirSync(path.dirname(SCENARIOS_PATH), { recursive: true });
      fs.writeFileSync(SCENARIOS_PATH, `${JSON.stringify({
        generatedAt: "2026-03-04T00:00:00.000Z",
        input: {
          topTopicIds: ["rates", "fx"],
          risingTopicIds: ["inflation"],
          macroSnapshot: {
            asOf: "2026-03-04T00:00:00.000Z",
            source: "test",
            values: {},
          },
        },
        scenarios: [{
          name: "Base",
          confidence: "중",
          triggerStatus: "met",
          triggerSummary: "pctChange(kr_usdkrw,5) > 0",
          observation: "환율 변동성 확대 관찰",
          interpretations: ["조건부 해석"],
          confirmIndicators: ["kr_usdkrw"],
          options: ["옵션 점검"],
          assumptions: ["가정"],
          trigger: ["pctChange(kr_usdkrw,5) > 0"],
          triggerDetails: [{
            label: "환율",
            expression: "pctChange(kr_usdkrw,5) > 0",
            status: "met",
            summary: "충족",
          }],
          leadingIndicators: ["kr_usdkrw"],
          invalidation: ["무효화"],
          impact: "영향",
          monitoringOptions: ["모니터링"],
          rationale: ["근거"],
        }],
      }, null, 2)}\n`, "utf-8");

      const response = await scenariosGET(requestGet("/api/planning/v3/news/scenarios"));
      const payload = await response.json() as {
        ok?: boolean;
        data?: {
          scenarios?: Array<{ personalImpact?: unknown; stress?: unknown }>;
        } | null;
      };
      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.data?.scenarios?.[0]?.personalImpact).toBeTruthy();
      expect(payload.data?.scenarios?.[0]?.stress).toBeTruthy();
    } finally {
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

  it("GET items blocks non-local host", async () => {
    const response = await itemsGET(requestGet("/api/planning/v3/news/items", "example.com"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("LOCAL_ONLY");
  });

  it("GET today blocks non-local host", async () => {
    const response = await todayGET(requestGet("/api/planning/v3/news/today", "example.com"));
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
            snippet: "기준금리 인상 압력 확대",
            fullText: "must never leak",
          },
          {
            topicId: "rates",
            topicLabel: "금리",
            title: "Sample title two",
            url: "https://example.com/sample-two",
            score: 1.1,
            publishedAt: "2026-03-04T01:00:00.000Z",
            sourceName: "source",
            snippet: "기준금리 인하 가능성 확대",
          },
        ],
        topTopics: [],
        burstTopics: [],
        watchlist: [],
        scenarioCards: [],
        summary: { observation: "obs", evidenceLinks: [], watchVariables: [], counterSignals: [] },
      }, null, 2)}\n`, "utf-8");

      const response = await digestGET(requestGet("/api/planning/v3/news/digest"));
      const payload = await response.json() as {
        ok?: boolean;
        data?: { topItems?: Array<Record<string, unknown>> } | null;
        topicContradictions?: Array<{ topicId?: string; contradictionGrade?: string }>;
      };
      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      const first = payload.data?.topItems?.[0] ?? {};
      expect(first.title).toBe("Sample title");
      expect(first.url).toBe("https://example.com/sample");
      expect(first.snippet).toBe("기준금리 인상 압력 확대");
      expect("fullText" in first).toBe(false);
      expect(payload.topicContradictions?.[0]?.topicId).toBe("rates");
      expect(payload.topicContradictions?.[0]?.contradictionGrade).toBe("med");
    } finally {
      restoreFile(DIGEST_PATH, digestBackup);
    }
  });

  it("GET items supports keyword/topic/source/days/burst filters and hides raw fields", async () => {
    const dbBackup = backupAndRemove(DB_PATH);
    const trendsBackup = backupAndRemove(TRENDS_PATH);
    const nowIso = new Date().toISOString();
    const recentIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const oldIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const db = openNewsDatabase(DB_PATH);
      try {
        const insert = db.prepare(`
          INSERT INTO news_items (
            id, sourceId, sourceName, feedItemId, url, canonicalUrl, title, snippet, description,
            publishedAt, fetchedAt, contentHash, dedupeKey,
            sourceWeight, sourceScore, keywordScore, recencyScore, focusScore, totalScore,
            relativeScore, scorePartsJson, primaryTopicId, primaryTopicLabel, createdAt
          ) VALUES (
            @id, @sourceId, @sourceName, @feedItemId, @url, @canonicalUrl, @title, @snippet, @description,
            @publishedAt, @fetchedAt, @contentHash, @dedupeKey,
            @sourceWeight, @sourceScore, @keywordScore, @recencyScore, @focusScore, @totalScore,
            @relativeScore, @scorePartsJson, @primaryTopicId, @primaryTopicLabel, @createdAt
          )
        `);
        insert.run({
          id: "news-1",
          sourceId: "bok_press_all",
          sourceName: "한국은행 보도자료",
          feedItemId: "g-1",
          url: "https://example.com/rates-1",
          canonicalUrl: "https://example.com/rates-1",
          title: "기준금리 동결 발표",
          snippet: "snippet rates",
          description: "description rates",
          publishedAt: recentIso,
          fetchedAt: nowIso,
          contentHash: "hash-1",
          dedupeKey: "dedupe-1",
          sourceWeight: 1.2,
          sourceScore: 0.4,
          keywordScore: 0.3,
          recencyScore: 0.2,
          focusScore: 0.1,
          totalScore: 1.0,
          relativeScore: 2.2,
          scorePartsJson: "{\"source\":0.4}",
          primaryTopicId: "rates",
          primaryTopicLabel: "금리/통화정책",
          createdAt: nowIso,
        });
        insert.run({
          id: "news-2",
          sourceId: "kosis_monthly_trend",
          sourceName: "KOSIS",
          feedItemId: "g-2",
          url: "https://example.com/fx-1",
          canonicalUrl: "https://example.com/fx-1",
          title: "환율 변동성 점검",
          snippet: "snippet fx",
          description: "description fx",
          publishedAt: recentIso,
          fetchedAt: nowIso,
          contentHash: "hash-2",
          dedupeKey: "dedupe-2",
          sourceWeight: 1.0,
          sourceScore: 0.3,
          keywordScore: 0.2,
          recencyScore: 0.2,
          focusScore: 0.1,
          totalScore: 0.8,
          relativeScore: 1.7,
          scorePartsJson: "{\"source\":0.3}",
          primaryTopicId: "fx",
          primaryTopicLabel: "환율/대외",
          createdAt: nowIso,
        });
        insert.run({
          id: "news-3",
          sourceId: "kostat_press",
          sourceName: "통계청",
          feedItemId: "g-3",
          url: "https://example.com/inflation-old",
          canonicalUrl: "https://example.com/inflation-old",
          title: "소비자물가 참고",
          snippet: "snippet old",
          description: "description old",
          publishedAt: oldIso,
          fetchedAt: nowIso,
          contentHash: "hash-3",
          dedupeKey: "dedupe-3",
          sourceWeight: 0.9,
          sourceScore: 0.2,
          keywordScore: 0.1,
          recencyScore: 0,
          focusScore: 0.1,
          totalScore: 0.4,
          relativeScore: 0.3,
          scorePartsJson: "{\"source\":0.2}",
          primaryTopicId: "inflation",
          primaryTopicLabel: "물가/인플레이션",
          createdAt: nowIso,
        });
      } finally {
        closeNewsDatabase(db);
      }

      fs.mkdirSync(path.dirname(TRENDS_PATH), { recursive: true });
      fs.writeFileSync(TRENDS_PATH, `${JSON.stringify({
        generatedAt: nowIso,
        timezone: "Asia/Seoul",
        todayKst: "2026-03-04",
        windowDays: 30,
        topics: [
          {
            topicId: "rates",
            topicLabel: "금리/통화정책",
            todayCount: 3,
            yesterdayCount: 1,
            delta: 2,
            ratio: 3,
            avgLast7d: 1,
            stddevLast7d: 1,
            burstZ: 2.1,
            burstLevel: "상",
            lowHistory: false,
            sourceDiversity: 1,
            topSourceShare: 1,
            scoreSum: 1,
            series: [],
          },
          {
            topicId: "fx",
            topicLabel: "환율/대외",
            todayCount: 2,
            yesterdayCount: 1,
            delta: 1,
            ratio: 2,
            avgLast7d: 1,
            stddevLast7d: 1,
            burstZ: 1.2,
            burstLevel: "중",
            lowHistory: false,
            sourceDiversity: 1,
            topSourceShare: 1,
            scoreSum: 1,
            series: [],
          },
        ],
        burstTopics: [],
      }, null, 2)}\n`, "utf-8");

      const response = await itemsGET(
        requestGet("/api/planning/v3/news/items?q=%EA%B8%B0%EC%A4%80%EA%B8%88%EB%A6%AC&topic=rates&source=bok_press_all&days=7&burst=%EC%83%81"),
      );
      const payload = await response.json() as {
        ok?: boolean;
        data?: {
          total?: number;
          items?: Array<Record<string, unknown>>;
          topics?: Array<{ topicId?: string; count?: number }>;
        } | null;
      };

      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.data?.total).toBe(1);
      expect(payload.data?.items?.length).toBe(1);

      const first = payload.data?.items?.[0] ?? {};
      expect(first.title).toBe("기준금리 동결 발표");
      expect(first.topicId).toBe("rates");
      expect(first.sourceId).toBe("bok_press_all");
      expect(first.burstLevel).toBe("상");
      expect("snippet" in first).toBe(false);
      expect("description" in first).toBe(false);
      expect("fullText" in first).toBe(false);

      const topicFacet = payload.data?.topics?.find((row) => row.topicId === "rates");
      expect(topicFacet?.count).toBe(1);
    } finally {
      restoreFile(DB_PATH, dbBackup);
      restoreFile(TRENDS_PATH, trendsBackup);
    }
  });

  it("POST refresh blocks when dev unlock/csrf context is missing", async () => {
    const response = await refreshPOST(requestPost({ csrf: "csrf-token" }, false));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("CSRF_MISMATCH");
    expect(runNewsRefreshMock).not.toHaveBeenCalled();
  });

  it("POST refresh runs planning pipeline with valid guard context", async () => {
    const response = await refreshPOST(requestPost({ csrf: "csrf-token" }));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        sourcesProcessed?: number;
        itemsFetched?: number;
        itemsNew?: number;
        itemsDeduped?: number;
        errorCount?: number;
      };
    };
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.itemsNew).toBe(3);
    expect(payload.data?.errorCount).toBe(0);
    expect(runNewsRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("news:refresh script is aligned to scripts/news_refresh.mjs", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };
    const script = parsed.scripts?.["news:refresh"] ?? "";
    expect(script).toContain("scripts/news_refresh.mjs");
  });

  it("GET settings blocks when same-origin headers are missing", async () => {
    const response = await settingsGET(requestGet("/api/planning/v3/news/settings"));
    const payload = await response.json() as { ok?: boolean; error?: { code?: string } };
    expect(response.status).toBe(403);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
  });

  it("GET settings returns defaults/effective config on local same-origin request", async () => {
    const backup = backupAndRemove(SETTINGS_PATH);
    try {
      const response = await settingsGET(requestGet("/api/planning/v3/news/settings", LOCAL_HOST, true));
      const payload = await response.json() as {
        ok?: boolean;
        data?: {
          sources?: Array<{ id?: string }>;
          topics?: Array<{ id?: string }>;
        };
      };
      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect((payload.data?.sources ?? []).length).toBeGreaterThan(0);
      expect((payload.data?.topics ?? []).length).toBeGreaterThan(0);
    } finally {
      restoreFile(SETTINGS_PATH, backup);
    }
  });

  it("POST settings writes local override file with csrf guard", async () => {
    const backup = backupAndRemove(SETTINGS_PATH);
    try {
      const denied = await settingsPOST(requestSettingsPost({
        csrf: "csrf-token",
        sources: [{ id: "bok_press_all", enabled: false, weight: 0.9 }],
      }, false));
      expect(denied.status).toBe(403);

      const allowed = await settingsPOST(requestSettingsPost({
        csrf: "csrf-token",
        sources: [{ id: "bok_press_all", enabled: false, weight: 0.9 }],
        topics: [{ id: "rates", keywords: ["기준금리", "테스트"] }],
      }));
      const payload = await allowed.json() as { ok?: boolean };
      expect(allowed.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(fs.existsSync(SETTINGS_PATH)).toBe(true);
    } finally {
      restoreFile(SETTINGS_PATH, backup);
    }
  });
});
