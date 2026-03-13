import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildResultDtoV1 } from "../../src/lib/planning/v2/resultDto";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const LOCAL_HOST = "localhost:3000";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

const { getRunMock } = vi.hoisted(() => ({
  getRunMock: vi.fn<() => Promise<PlanningRunRecord | null>>(),
}));

vi.mock("../../src/lib/planning/server/store/runStore", () => ({
  getRun: getRunMock,
}));

import { GET as runReportGET } from "../../src/app/api/planning/v2/runs/[id]/report/route";
import { GET as exportHtmlGET } from "../../src/app/api/planning/reports/[runId]/export.html/route";

function buildGetRequest(urlPath: string): Request {
  return new Request(`${LOCAL_ORIGIN}${urlPath}`, {
    method: "GET",
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/reports`,
    },
  });
}

function createRunRecord(withEngine: boolean): PlanningRunRecord {
  const resultDto = buildResultDtoV1({
    generatedAt: "2026-03-05T00:00:00.000Z",
    simulate: {
      summary: {
        startNetWorthKrw: 10_000_000,
        endNetWorthKrw: 12_000_000,
        worstCashKrw: 2_000_000,
        worstCashMonthIndex: 3,
        goalsAchievedCount: 1,
        goalsMissedCount: 0,
        warningsCount: 0,
      },
      warnings: [],
      goalsStatus: [],
      keyTimelinePoints: [
        {
          monthIndex: 0,
          row: {
            month: 1,
            income: 4_000_000,
            expenses: 2_200_000,
            debtPayment: 300_000,
            liquidAssets: 4_000_000,
            netWorth: 10_000_000,
            totalDebt: 1_000_000,
          },
        },
      ],
      timeline: [
        {
          month: 1,
          income: 4_000_000,
          expenses: 2_200_000,
          debtPayment: 300_000,
          liquidAssets: 4_000_000,
          netWorth: 10_000_000,
          totalDebt: 1_000_000,
        },
      ],
    },
  });

  const engine = {
    stage: "DEBT" as const,
    financialStatus: {
      stage: "DEBT" as const,
      trace: {
        savingCapacity: 1_800_000,
        savingRate: 0.45,
        liquidAssets: 4_000_000,
        debtBalance: 1_000_000,
        emergencyFundTarget: 13_200_000,
        emergencyFundGap: 9_200_000,
        triggeredRules: ["debt_balance_positive"],
      },
    },
    stageDecision: {
      priority: "PAY_DEBT" as const,
      investmentAllowed: false,
      warnings: ["부채 정리가 우선입니다."],
    },
  };

  return {
    version: 1,
    id: "run-contract-mode",
    profileId: "profile-1",
    createdAt: "2026-03-05T00:00:00.000Z",
    input: {
      horizonMonths: 12,
    },
    meta: {},
    outputs: {
      ...(withEngine ? { engineSchemaVersion: 1, engine } : {}),
      resultDto,
      simulate: {} as PlanningRunRecord["outputs"]["simulate"],
    },
  };
}

describe("report contract routes", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    getRunMock.mockReset();
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("keeps run report route strict-only for legacy runs", async () => {
    getRunMock.mockResolvedValue(createRunRecord(false));

    const strictResponse = await runReportGET(
      buildGetRequest("/api/planning/v2/runs/run-contract-mode/report"),
      { params: Promise.resolve({ id: "run-contract-mode" }) },
    );
    expect(strictResponse.status).toBe(500);

    const compatResponse = await runReportGET(
      buildGetRequest("/api/planning/v2/runs/run-contract-mode/report?contract=compat"),
      { params: Promise.resolve({ id: "run-contract-mode" }) },
    );
    expect(compatResponse.status).toBe(500);
  });

  it("keeps export html route strict-only for legacy runs", async () => {
    getRunMock.mockResolvedValue(createRunRecord(false));

    const strictResponse = await exportHtmlGET(
      buildGetRequest("/api/planning/reports/run-contract-mode/export.html"),
      { params: Promise.resolve({ runId: "run-contract-mode" }) },
    );
    expect(strictResponse.status).toBe(500);

    const compatResponse = await exportHtmlGET(
      buildGetRequest("/api/planning/reports/run-contract-mode/export.html?contract=compat"),
      { params: Promise.resolve({ runId: "run-contract-mode" }) },
    );
    expect(compatResponse.status).toBe(500);
  });
});
