import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as alertRulesGET, POST as alertRulesPOST } from "../src/app/api/planning/v3/news/alerts/rules/route";
import { GET as alertsGET, POST as alertsPOST } from "../src/app/api/planning/v3/news/alerts/route";
import { GET as newsExposureGET, POST as newsExposurePOST } from "../src/app/api/planning/v3/news/exposure/route";
import { DELETE as noteDELETE, PATCH as notePATCH } from "../src/app/api/planning/v3/news/notes/[noteId]/route";
import { GET as notesGET, POST as notesPOST } from "../src/app/api/planning/v3/news/notes/route";
import { GET as scenariosGET } from "../src/app/api/planning/v3/news/scenarios/route";
import { GET as settingsGET, POST as settingsPOST } from "../src/app/api/planning/v3/news/settings/route";
import { GET as weeklyPlanGET, POST as weeklyPlanPOST } from "../src/app/api/planning/v3/news/weekly-plan/route";
import {
  resolveAlertEventsPath,
  resolveAlertEventStatePath,
  resolveAlertRulesOverridePath,
} from "../src/lib/news/alerts";
import { resolveNewsScenarioJsonPath } from "../src/lib/news/storageSqlite";
import { resolveExposureProfilePath } from "../planning/v3/exposure/store";
import { resolveNewsNotesDir } from "../planning/v3/news/notes";
import { resolveNewsSettingsPath } from "../planning/v3/news/settings";
import { resolveWeeklyPlanPath } from "../planning/v3/news/weeklyPlan";

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

const LOCAL_HOST = "localhost:3100";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (typeof value === "string") env[key] = value;
    else delete env[key];
  }
}

function userHeaders(userId: string, refererPath: string): Headers {
  return new Headers({
    host: LOCAL_HOST,
    origin: LOCAL_ORIGIN,
    referer: `${LOCAL_ORIGIN}${refererPath}`,
    "x-planning-user-id": userId,
  });
}

function requestGet(pathname: string, userId: string, refererPath: string): Request {
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method: "GET",
    headers: userHeaders(userId, refererPath),
  });
}

function requestWrite(
  method: "POST" | "PATCH" | "DELETE",
  pathname: string,
  userId: string,
  refererPath: string,
  body: Record<string, unknown>,
): Request {
  const headers = userHeaders(userId, refererPath);
  headers.set("cookie", "dev_csrf=test");
  headers.set("content-type", "application/json");
  return new Request(`${LOCAL_ORIGIN}${pathname}`, {
    method,
    headers,
    body: JSON.stringify({ ...body, csrf: "test" }),
  });
}

function expectTrustedMeta(payload: unknown, userId: string): void {
  const meta = (payload as { meta?: { userId?: string; authSource?: string } }).meta;
  expect(meta).toEqual({
    userId,
    authSource: "trusted-header",
  });
}

function writeAlertEventFixture(): void {
  const eventsPath = resolveAlertEventsPath();
  fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
  fs.writeFileSync(eventsPath, `${JSON.stringify({
    id: "news-alert-a1",
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
  })}\n`, "utf-8");
}

function writeRatesScenarioFixture(): void {
  const scenariosPath = resolveNewsScenarioJsonPath();
  fs.mkdirSync(path.dirname(scenariosPath), { recursive: true });
  fs.writeFileSync(scenariosPath, `${JSON.stringify({
    generatedAt: "2026-03-04T00:00:00.000Z",
    input: {
      topTopicIds: ["rates"],
      risingTopicIds: [],
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
      triggerSummary: "pctChange(kr_base_rate,5) > 0",
      observation: "금리 상승 압력 관찰",
      interpretations: ["조건부 해석"],
      confirmIndicators: ["kr_base_rate"],
      options: ["옵션 점검"],
      assumptions: ["가정"],
      trigger: ["pctChange(kr_base_rate,5) > 0"],
      triggerDetails: [{
        label: "금리",
        expression: "pctChange(kr_base_rate,5) > 0",
        status: "met",
        summary: "충족",
      }],
      leadingIndicators: ["kr_base_rate"],
      invalidation: ["무효화"],
      impact: "영향",
      monitoringOptions: ["모니터링"],
      rationale: ["근거"],
      linkedTopics: ["rates"],
    }],
  }, null, 2)}\n`, "utf-8");
}

describe("planning v3 news user scope", () => {
  let root = "";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T00:00:00.000Z"));
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-news-user-scope-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = path.join(root, "planning");
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_AUTH_REQUIRED = "1";
    env.PLANNING_TRUST_AUTH_HEADERS = "1";
    env.PLANNING_USER_ID = "default";
    delete env.AUTH_SECRET;
    delete env.NEXTAUTH_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps news settings overrides isolated by planning user", async () => {
    const initialResponse = await settingsGET(requestGet(
      "/api/planning/v3/news/settings",
      "alice",
      "/planning/v3/news/settings",
    ));
    expect(initialResponse.status).toBe(200);
    const initialPayload = await initialResponse.json() as {
      data?: {
        sources?: Array<{ id?: string; overrideEnabled?: boolean | null; overrideWeight?: number | null }>;
        topics?: Array<{ id?: string; overrideKeywords?: string[] | null }>;
      };
    };
    const sourceId = initialPayload.data?.sources?.[0]?.id ?? "";
    const topicId = initialPayload.data?.topics?.[0]?.id ?? "";
    expect(sourceId).not.toBe("");
    expect(topicId).not.toBe("");

    const postResponse = await settingsPOST(requestWrite(
      "POST",
      "/api/planning/v3/news/settings",
      "alice",
      "/planning/v3/news/settings",
      {
        sources: [{ id: sourceId, enabled: false, weight: 0.91 }],
        topics: [{ id: topicId, keywords: ["alice-keyword"] }],
      },
    ));
    expect(postResponse.status).toBe(200);
    expectTrustedMeta(await postResponse.json(), "alice");

    const bobResponse = await settingsGET(requestGet(
      "/api/planning/v3/news/settings",
      "bob",
      "/planning/v3/news/settings",
    ));
    const bobPayload = await bobResponse.json() as {
      data?: {
        sources?: Array<{ id?: string; overrideEnabled?: boolean | null; overrideWeight?: number | null }>;
        topics?: Array<{ id?: string; overrideKeywords?: string[] | null }>;
      };
    };
    expect(bobResponse.status).toBe(200);
    expectTrustedMeta(bobPayload, "bob");
    expect(bobPayload.data?.sources?.find((row) => row.id === sourceId)?.overrideEnabled).toBeNull();
    expect(bobPayload.data?.sources?.find((row) => row.id === sourceId)?.overrideWeight).toBeNull();
    expect(bobPayload.data?.topics?.find((row) => row.id === topicId)?.overrideKeywords).toBeNull();

    const aliceResponse = await settingsGET(requestGet(
      "/api/planning/v3/news/settings",
      "alice",
      "/planning/v3/news/settings",
    ));
    const alicePayload = await aliceResponse.json() as {
      data?: {
        sources?: Array<{ id?: string; overrideEnabled?: boolean | null; overrideWeight?: number | null }>;
        topics?: Array<{ id?: string; overrideKeywords?: string[] | null }>;
      };
    };
    expect(aliceResponse.status).toBe(200);
    expectTrustedMeta(alicePayload, "alice");
    expect(alicePayload.data?.sources?.find((row) => row.id === sourceId)?.overrideEnabled).toBe(false);
    expect(alicePayload.data?.sources?.find((row) => row.id === sourceId)?.overrideWeight).toBe(0.91);
    expect(alicePayload.data?.topics?.find((row) => row.id === topicId)?.overrideKeywords).toEqual(["alice-keyword"]);
    expect(resolveNewsSettingsPath().replaceAll("\\", "/")).toContain("/users/alice/planning-v3/news/settings.json");
  });

  it("keeps alert rule overrides isolated by planning user", async () => {
    const initialResponse = await alertRulesGET(requestGet(
      "/api/planning/v3/news/alerts/rules",
      "alice",
      "/planning/v3/news/settings",
    ));
    expect(initialResponse.status).toBe(200);
    const initialPayload = await initialResponse.json() as {
      data?: { effective?: Array<{ id?: string; enabled?: boolean }> };
    };
    const ruleId = initialPayload.data?.effective?.find((row) => row.enabled !== false)?.id
      ?? initialPayload.data?.effective?.[0]?.id
      ?? "";
    expect(ruleId).not.toBe("");

    const postResponse = await alertRulesPOST(requestWrite(
      "POST",
      "/api/planning/v3/news/alerts/rules",
      "alice",
      "/planning/v3/news/settings",
      { rules: [{ id: ruleId, enabled: false }] },
    ));
    expect(postResponse.status).toBe(200);
    expectTrustedMeta(await postResponse.json(), "alice");

    const bobResponse = await alertRulesGET(requestGet(
      "/api/planning/v3/news/alerts/rules",
      "bob",
      "/planning/v3/news/settings",
    ));
    const bobPayload = await bobResponse.json() as {
      data?: {
        overrides?: { rules?: Array<{ id?: string; enabled?: boolean }> };
        effective?: Array<{ id?: string; enabled?: boolean }>;
      };
    };
    expect(bobResponse.status).toBe(200);
    expectTrustedMeta(bobPayload, "bob");
    expect((bobPayload.data?.overrides?.rules ?? []).some((row) => row.id === ruleId)).toBe(false);
    expect(bobPayload.data?.effective?.find((row) => row.id === ruleId)?.enabled).not.toBe(false);

    const aliceResponse = await alertRulesGET(requestGet(
      "/api/planning/v3/news/alerts/rules",
      "alice",
      "/planning/v3/news/settings",
    ));
    const alicePayload = await aliceResponse.json() as {
      data?: {
        overrides?: { rules?: Array<{ id?: string; enabled?: boolean }> };
        effective?: Array<{ id?: string; enabled?: boolean }>;
      };
    };
    expect(aliceResponse.status).toBe(200);
    expectTrustedMeta(alicePayload, "alice");
    expect((alicePayload.data?.overrides?.rules ?? []).some((row) => row.id === ruleId && row.enabled === false)).toBe(true);
    expect(alicePayload.data?.effective?.find((row) => row.id === ruleId)?.enabled).toBe(false);
    expect(resolveAlertRulesOverridePath().replaceAll("\\", "/")).toContain("/users/alice/news/alerts/rules.override.json");
  });

  it("shares alert event feed but isolates alert event state by planning user", async () => {
    writeAlertEventFixture();

    const postResponse = await alertsPOST(requestWrite(
      "POST",
      "/api/planning/v3/news/alerts",
      "alice",
      "/planning/v3/news/alerts",
      { id: "news-alert-a1", action: "ack", days: 30 },
    ));
    expect(postResponse.status).toBe(200);
    expectTrustedMeta(await postResponse.json(), "alice");

    const bobResponse = await alertsGET(requestGet(
      "/api/planning/v3/news/alerts?days=30",
      "bob",
      "/planning/v3/news/alerts",
    ));
    const bobPayload = await bobResponse.json() as {
      data?: { groups?: Array<{ events?: Array<{ id?: string; state?: { acknowledgedAt?: string | null } }> }> };
    };
    expect(bobResponse.status).toBe(200);
    expectTrustedMeta(bobPayload, "bob");
    const bobEvent = bobPayload.data?.groups?.flatMap((group) => group.events ?? []).find((event) => event.id === "news-alert-a1");
    expect(bobEvent?.state?.acknowledgedAt).toBeNull();

    const aliceResponse = await alertsGET(requestGet(
      "/api/planning/v3/news/alerts?days=30",
      "alice",
      "/planning/v3/news/alerts",
    ));
    const alicePayload = await aliceResponse.json() as {
      data?: { groups?: Array<{ events?: Array<{ id?: string; state?: { acknowledgedAt?: string | null } }> }> };
    };
    expect(aliceResponse.status).toBe(200);
    expectTrustedMeta(alicePayload, "alice");
    const aliceEvent = alicePayload.data?.groups?.flatMap((group) => group.events ?? []).find((event) => event.id === "news-alert-a1");
    expect(typeof aliceEvent?.state?.acknowledgedAt).toBe("string");
    expect(resolveAlertEventStatePath().replaceAll("\\", "/")).toContain("/users/alice/news/alerts/event-state.json");
  });

  it("keeps news notes list, update, and delete scoped by planning user", async () => {
    const createdResponse = await notesPOST(requestWrite(
      "POST",
      "/api/planning/v3/news/notes",
      "alice",
      "/planning/v3/news",
      {
        targetType: "item",
        targetId: "https://example.com/alice",
        tags: ["관찰"],
        note: "alice memo",
      },
    ));
    const createdPayload = await createdResponse.json() as { data?: { id?: string } };
    expect(createdResponse.status).toBe(200);
    expectTrustedMeta(createdPayload, "alice");
    const noteId = createdPayload.data?.id ?? "";
    expect(noteId.length).toBeGreaterThan(10);

    const bobListResponse = await notesGET(requestGet(
      "/api/planning/v3/news/notes",
      "bob",
      "/planning/v3/news",
    ));
    const bobListPayload = await bobListResponse.json() as { data?: { total?: number } };
    expect(bobListResponse.status).toBe(200);
    expectTrustedMeta(bobListPayload, "bob");
    expect(bobListPayload.data?.total).toBe(0);

    const bobPatchResponse = await notePATCH(
      requestWrite(
        "PATCH",
        `/api/planning/v3/news/notes/${noteId}`,
        "bob",
        "/planning/v3/news",
        { note: "bob takeover" },
      ),
      { params: Promise.resolve({ noteId }) },
    );
    const bobPatchPayload = await bobPatchResponse.json();
    expect(bobPatchResponse.status).toBe(404);
    expectTrustedMeta(bobPatchPayload, "bob");

    const bobDeleteResponse = await noteDELETE(
      requestWrite(
        "DELETE",
        `/api/planning/v3/news/notes/${noteId}`,
        "bob",
        "/planning/v3/news",
        {},
      ),
      { params: Promise.resolve({ noteId }) },
    );
    const bobDeletePayload = await bobDeleteResponse.json();
    expect(bobDeleteResponse.status).toBe(404);
    expectTrustedMeta(bobDeletePayload, "bob");

    const alicePatchResponse = await notePATCH(
      requestWrite(
        "PATCH",
        `/api/planning/v3/news/notes/${noteId}`,
        "alice",
        "/planning/v3/news",
        { note: "alice memo updated", tags: ["업데이트"] },
      ),
      { params: Promise.resolve({ noteId }) },
    );
    const alicePatchPayload = await alicePatchResponse.json() as { data?: { note?: string; tags?: string[] } };
    expect(alicePatchResponse.status).toBe(200);
    expectTrustedMeta(alicePatchPayload, "alice");
    expect(alicePatchPayload.data?.note).toBe("alice memo updated");
    expect(alicePatchPayload.data?.tags).toEqual(["업데이트"]);

    const aliceDeleteResponse = await noteDELETE(
      requestWrite(
        "DELETE",
        `/api/planning/v3/news/notes/${noteId}`,
        "alice",
        "/planning/v3/news",
        {},
      ),
      { params: Promise.resolve({ noteId }) },
    );
    const aliceDeletePayload = await aliceDeleteResponse.json();
    expect(aliceDeleteResponse.status).toBe(200);
    expectTrustedMeta(aliceDeletePayload, "alice");

    const aliceListResponse = await notesGET(requestGet(
      "/api/planning/v3/news/notes",
      "alice",
      "/planning/v3/news",
    ));
    const aliceListPayload = await aliceListResponse.json() as { data?: { total?: number } };
    expect(aliceListResponse.status).toBe(200);
    expect(aliceListPayload.data?.total).toBe(0);
    expect(resolveNewsNotesDir().replaceAll("\\", "/")).toContain("/users/alice/planning-v3/news/notes");
  });

  it("keeps weekly plan scoped by planning user", async () => {
    const postResponse = await weeklyPlanPOST(requestWrite(
      "POST",
      "/api/planning/v3/news/weekly-plan",
      "alice",
      "/planning/v3/news",
      {
        weekOf: "2026-03-02",
        topics: ["rates"],
        seriesIds: ["KR_BOK_BASE_RATE"],
      },
    ));
    const postPayload = await postResponse.json() as { data?: { topics?: string[]; seriesIds?: string[] } };
    expect(postResponse.status).toBe(200);
    expectTrustedMeta(postPayload, "alice");
    expect(postPayload.data?.topics).toEqual(["rates"]);
    expect(postPayload.data?.seriesIds).toEqual(["kr_base_rate"]);
    expect(resolveWeeklyPlanPath().replaceAll("\\", "/")).toContain("/users/alice/planning-v3/news/weekly_plan.json");

    const bobResponse = await weeklyPlanGET(requestGet(
      "/api/planning/v3/news/weekly-plan",
      "bob",
      "/planning/v3/news",
    ));
    const bobPayload = await bobResponse.json() as { data?: unknown };
    expect(bobResponse.status).toBe(200);
    expectTrustedMeta(bobPayload, "bob");
    expect(bobPayload.data).toBeNull();

    const aliceResponse = await weeklyPlanGET(requestGet(
      "/api/planning/v3/news/weekly-plan",
      "alice",
      "/planning/v3/news",
    ));
    const alicePayload = await aliceResponse.json() as { data?: { topics?: string[]; seriesIds?: string[] } | null };
    expect(aliceResponse.status).toBe(200);
    expectTrustedMeta(alicePayload, "alice");
    expect(alicePayload.data?.topics).toEqual(["rates"]);
    expect(alicePayload.data?.seriesIds).toEqual(["kr_base_rate"]);
  });

  it("keeps news exposure profile and scenario personal impact scoped by planning user", async () => {
    writeRatesScenarioFixture();

    const aliceProfileResponse = await newsExposurePOST(requestWrite(
      "POST",
      "/api/planning/v3/news/exposure",
      "alice",
      "/planning/v3/news/settings",
      {
        profile: {
          debt: {
            hasDebt: "yes",
            rateType: "variable",
            repricingHorizon: "short",
          },
          liquidity: {
            monthsOfCashBuffer: "low",
          },
        },
      },
    ));
    const aliceProfilePayload = await aliceProfileResponse.json() as { data?: { debt?: { hasDebt?: string } } };
    expect(aliceProfileResponse.status).toBe(200);
    expectTrustedMeta(aliceProfilePayload, "alice");
    expect(aliceProfilePayload.data?.debt?.hasDebt).toBe("yes");
    expect(resolveExposureProfilePath().replaceAll("\\", "/")).toContain("/users/alice/planning-v3/exposure/profile.json");

    const bobProfileResponse = await newsExposurePOST(requestWrite(
      "POST",
      "/api/planning/v3/news/exposure",
      "bob",
      "/planning/v3/news/settings",
      {
        profile: {
          debt: {
            hasDebt: "no",
            rateType: "none",
            repricingHorizon: "none",
          },
          liquidity: {
            monthsOfCashBuffer: "high",
          },
        },
      },
    ));
    const bobProfilePayload = await bobProfileResponse.json() as { data?: { debt?: { hasDebt?: string } } };
    expect(bobProfileResponse.status).toBe(200);
    expectTrustedMeta(bobProfilePayload, "bob");
    expect(bobProfilePayload.data?.debt?.hasDebt).toBe("no");

    const bobReadResponse = await newsExposureGET(requestGet(
      "/api/planning/v3/news/exposure",
      "bob",
      "/planning/v3/news/settings",
    ));
    const bobReadPayload = await bobReadResponse.json() as { data?: { debt?: { hasDebt?: string } } | null };
    expect(bobReadResponse.status).toBe(200);
    expectTrustedMeta(bobReadPayload, "bob");
    expect(bobReadPayload.data?.debt?.hasDebt).toBe("no");

    const aliceScenarioResponse = await scenariosGET(requestGet(
      "/api/planning/v3/news/scenarios",
      "alice",
      "/planning/v3/news",
    ));
    const aliceScenarioPayload = await aliceScenarioResponse.json() as {
      data?: {
        scenarios?: Array<{ personalImpact?: { debtServiceRisk?: string; bufferAdequacy?: string } }>;
      } | null;
    };
    expect(aliceScenarioResponse.status).toBe(200);
    expectTrustedMeta(aliceScenarioPayload, "alice");
    expect(aliceScenarioPayload.data?.scenarios?.[0]?.personalImpact?.debtServiceRisk).toBe("High");
    expect(aliceScenarioPayload.data?.scenarios?.[0]?.personalImpact?.bufferAdequacy).toBe("Low");

    const bobScenarioResponse = await scenariosGET(requestGet(
      "/api/planning/v3/news/scenarios",
      "bob",
      "/planning/v3/news",
    ));
    const bobScenarioPayload = await bobScenarioResponse.json() as {
      data?: {
        scenarios?: Array<{ personalImpact?: { debtServiceRisk?: string; bufferAdequacy?: string } }>;
      } | null;
    };
    expect(bobScenarioResponse.status).toBe(200);
    expectTrustedMeta(bobScenarioPayload, "bob");
    expect(bobScenarioPayload.data?.scenarios?.[0]?.personalImpact?.debtServiceRisk).toBe("Low");
    expect(bobScenarioPayload.data?.scenarios?.[0]?.personalImpact?.bufferAdequacy).toBe("High");
  });
});
