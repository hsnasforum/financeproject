import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";
import { installPlanningAuthRequiredFalseForTest } from "../planning/auth/testPlanningAuthEnv";

const {
  ensureRunActionProgressMock,
  ensureRunActionPlanMock,
  getRunActionPlanMock,
  getRunActionProgressMock,
  getRunMock,
  sanitizeRunRecordForResponseMock,
  updateRunMock,
} = vi.hoisted(() => ({
  ensureRunActionProgressMock: vi.fn(),
  ensureRunActionPlanMock: vi.fn(),
  getRunActionPlanMock: vi.fn(),
  getRunActionProgressMock: vi.fn(),
  getRunMock: vi.fn(),
  sanitizeRunRecordForResponseMock: vi.fn((value: PlanningRunRecord) => value),
  updateRunMock: vi.fn(),
}));

vi.mock("../../src/lib/planning/server/store/runActionStore", () => ({
  ensureRunActionProgress: ensureRunActionProgressMock,
  ensureRunActionPlan: ensureRunActionPlanMock,
  getRunActionPlan: getRunActionPlanMock,
  getRunActionProgress: getRunActionProgressMock,
  summarizeRunActionProgress: vi.fn(),
  updateRunActionProgress: vi.fn(),
}));

vi.mock("../../src/lib/planning/server/store/runStore", () => ({
  deleteRun: vi.fn(),
  getRun: getRunMock,
  updateRun: updateRunMock,
}));

vi.mock("../../src/lib/planning/api/runResponseSanitizer", () => ({
  sanitizeRunRecordForResponse: sanitizeRunRecordForResponseMock,
}));

import { GET as runDetailGET } from "../../src/app/api/planning/v2/runs/[id]/route";

const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

installPlanningAuthRequiredFalseForTest();

function buildGetRequest(urlPath: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/runs`,
    },
  });
}

function createRun(): PlanningRunRecord {
  return {
    version: 1,
    id: "run-fallback",
    profileId: "profile-1",
    createdAt: "2026-03-11T00:00:00.000Z",
    title: "fallback run",
    overallStatus: "SUCCESS",
    input: {
      horizonMonths: 12,
    },
    meta: {},
    outputs: {},
    stages: [],
  };
}

describe("GET /api/planning/v2/runs/[id] fallback", () => {
  beforeEach(() => {
    ensureRunActionProgressMock.mockReset();
    ensureRunActionPlanMock.mockReset();
    getRunActionPlanMock.mockReset();
    getRunActionProgressMock.mockReset();
    getRunMock.mockReset();
    sanitizeRunRecordForResponseMock.mockClear();
    updateRunMock.mockReset();
  });

  it("keeps run repository, sanitizer, and audit writes behind the run route service", () => {
    const routeSources = [
      "src/app/api/planning/v2/runs/[id]/route.ts",
      "src/app/api/planning/v2/runs/[id]/action-plan/route.ts",
    ].map((filePath) => fs.readFileSync(path.join(process.cwd(), filePath), "utf8"));
    const serviceSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/planning/server/runs/routeService.ts"),
      "utf8",
    );

    for (const routeSource of routeSources) {
      expect(routeSource).not.toContain("auditLogStore");
      expect(routeSource).not.toContain("server/runs/repository");
      expect(routeSource).not.toContain("runResponseSanitizer");
    }
    expect(serviceSource).toContain("appendAuditLog");
    expect(serviceSource).toContain("sanitizeRunRecordForResponse");
    expect(serviceSource).toContain("getCurrentUserRun");
    expect(serviceSource).toContain("ensureCurrentUserRunActionPlan");
    expect(serviceSource).toContain("updateCurrentUserRunActionProgress");
  });

  it("returns 200 with canonical action center without persisting run meta", async () => {
    const run = createRun();
    getRunMock.mockResolvedValue(run);
    getRunActionPlanMock.mockResolvedValue({ items: [{ actionKey: "action-1" }] });
    getRunActionProgressMock.mockResolvedValue({ items: [{ actionKey: "action-1", status: "todo" }] });
    updateRunMock.mockRejectedValue(new Error("write failed"));

    const response = await runDetailGET(
      buildGetRequest("/api/planning/v2/runs/run-fallback"),
      { params: Promise.resolve({ id: "run-fallback" }) },
    );

    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        actionCenter?: {
          plan?: { items?: Array<{ actionKey?: string }> };
          progress?: { items?: Array<{ actionKey?: string; status?: string }> };
        };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.actionCenter?.plan?.items?.[0]?.actionKey).toBe("action-1");
    expect(payload.data?.actionCenter?.progress?.items?.[0]?.status).toBe("todo");
    expect(updateRunMock).not.toHaveBeenCalled();
  });

  it("returns the run payload even when action center hydration fails", async () => {
    const run = createRun();
    getRunMock.mockResolvedValue(run);
    getRunActionPlanMock.mockRejectedValue(new Error("plan failed"));

    const response = await runDetailGET(
      buildGetRequest("/api/planning/v2/runs/run-fallback"),
      { params: Promise.resolve({ id: "run-fallback" }) },
    );

    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        id?: string;
        actionCenter?: unknown;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.id).toBe("run-fallback");
    expect(payload.data?.actionCenter).toBeUndefined();
  });
});
