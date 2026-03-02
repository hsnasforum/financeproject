import { describe, expect, it, vi } from "vitest";
import { executeRunPipeline, RunPipelineFatalError, type StepStatus } from "../../../src/app/planning/_lib/runPipeline";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function buildBaseArgs(fetchFn: typeof fetch) {
  return {
    profile: {
      monthlyIncomeNet: 4_000_000,
      monthlyEssentialExpenses: 1_500_000,
      monthlyDiscretionaryExpenses: 500_000,
      liquidAssets: 5_000_000,
      investmentAssets: 10_000_000,
      debts: [],
      goals: [],
    },
    horizonMonths: 240,
    assumptions: {
      inflationPct: 2,
      expectedReturnPct: 5,
    },
    policyId: "balanced",
    monteCarlo: {
      paths: 2000,
      seed: 12345,
    },
    actions: {
      includeProducts: false,
      maxCandidatesPerAction: 5,
    },
    debt: {
      offers: [],
      options: {},
    },
    toggles: {
      scenarios: false,
      monteCarlo: false,
      actions: false,
      debt: false,
    },
    flags: {
      monteCarloEnabled: true,
      includeProductsEnabled: true,
    },
    healthAck: true,
    fetchFn,
  };
}

describe("planning runPipeline", () => {
  it("keeps simulate result when scenarios fails", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        data: {
          summary: {
            endNetWorth: 100,
          },
        },
        meta: {},
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: false,
        error: {
          code: "INPUT",
          message: "scenario failed",
        },
      }, 400));

    const result = await executeRunPipeline({
      ...buildBaseArgs(fetchMock),
      toggles: {
        scenarios: true,
        monteCarlo: false,
        actions: false,
        debt: false,
      },
    });

    expect(result.simulate).toBeTruthy();
    expect(result.scenarios).toBeUndefined();
    expect(result.stepStatuses.find((step) => step.id === "simulate")?.state).toBe("SUCCESS");
    expect(result.stepStatuses.find((step) => step.id === "scenarios")?.state).toBe("FAILED");
  });

  it("marks monteCarlo as skipped when budget is exceeded", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        data: {
          summary: {
            endNetWorth: 100,
          },
        },
        meta: {},
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: false,
        error: {
          code: "BUDGET_EXCEEDED",
          message: "budget exceeded",
        },
      }, 400));

    const result = await executeRunPipeline({
      ...buildBaseArgs(fetchMock),
      toggles: {
        scenarios: false,
        monteCarlo: true,
        actions: false,
        debt: false,
      },
    });

    const monteStep = result.stepStatuses.find((step) => step.id === "monteCarlo");
    expect(monteStep?.state).toBe("SKIPPED");
    expect(monteStep?.message).toContain("예산 초과");
  });

  it("marks actions as skipped when includeProducts is disabled on server", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        data: {
          summary: {
            endNetWorth: 100,
          },
        },
        meta: {},
      }));

    const result = await executeRunPipeline({
      ...buildBaseArgs(fetchMock),
      actions: {
        includeProducts: true,
        maxCandidatesPerAction: 5,
      },
      toggles: {
        scenarios: false,
        monteCarlo: false,
        actions: true,
        debt: false,
      },
      flags: {
        monteCarloEnabled: true,
        includeProductsEnabled: false,
      },
    });

    const actionStep = result.stepStatuses.find((step) => step.id === "actions");
    expect(actionStep?.state).toBe("SKIPPED");
    expect(actionStep?.message).toContain("서버 비활성");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails fast when simulate fails and keeps later steps pending", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: false,
        error: {
          code: "INPUT",
          message: "simulate failed",
        },
      }, 400));

    const statusTimeline: StepStatus[][] = [];

    await expect(executeRunPipeline({
      ...buildBaseArgs(fetchMock),
      toggles: {
        scenarios: true,
        monteCarlo: true,
        actions: true,
        debt: true,
      },
      onStepStatus: (statuses) => {
        statusTimeline.push(statuses);
      },
    })).rejects.toMatchObject({
      stepId: "simulate",
      code: "INPUT",
    } satisfies Partial<RunPipelineFatalError>);

    const lastStatuses = statusTimeline[statusTimeline.length - 1] ?? [];
    expect(lastStatuses.find((step) => step.id === "simulate")?.state).toBe("FAILED");
    expect(lastStatuses.find((step) => step.id === "scenarios")?.state).toBe("PENDING");
    expect(lastStatuses.find((step) => step.id === "monteCarlo")?.state).toBe("PENDING");
    expect(lastStatuses.find((step) => step.id === "actions")?.state).toBe("PENDING");
    expect(lastStatuses.find((step) => step.id === "debtStrategy")?.state).toBe("PENDING");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
