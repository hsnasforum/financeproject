import { describe, expect, it } from "vitest";
import { aggregateReportWarningsFromRun } from "../../src/app/planning/reports/_lib/dashboardWarnings";
import { REASON_CODE_MESSAGES_KO, debtStrategyWarningMessage } from "../../src/lib/planning/v2/warningsCatalog.ko";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

function buildRun(input?: Partial<PlanningRunRecord>): PlanningRunRecord {
  return {
    version: 1,
    id: input?.id ?? "run-1",
    profileId: input?.profileId ?? "profile-1",
    createdAt: input?.createdAt ?? "2026-03-01T00:00:00.000Z",
    input: input?.input ?? {
      horizonMonths: 120,
    },
    meta: input?.meta ?? {
      health: {
        warningsCodes: [],
        criticalCount: 0,
      },
    },
    outputs: input?.outputs ?? {},
  };
}

describe("aggregateReportWarningsFromRun", () => {
  it("collapses duplicate warnings and maps known codes to localized messages", () => {
    const run = buildRun({
      meta: {
        health: {
          warningsCodes: ["SNAPSHOT_STALE", "SNAPSHOT_STALE"],
          criticalCount: 0,
        },
      },
      outputs: {
        simulate: {
          ref: {
            name: "simulate",
            path: ".data/test/report-dashboard-warnings/run-1/simulate.json",
          },
          warnings: ["NEGATIVE_CASHFLOW", "NEGATIVE_CASHFLOW"],
        },
        debtStrategy: {
          ref: {
            name: "debtStrategy",
            path: ".data/test/report-dashboard-warnings/run-1/debt-strategy.json",
          },
          warnings: [
            { code: "DSR_HIGH_WARN", message: "raw message ignored" },
          ],
        },
      },
    });

    const rows = aggregateReportWarningsFromRun(run);
    const simulate = rows.find((row) => row.code === "NEGATIVE_CASHFLOW");
    const health = rows.find((row) => row.code === "SNAPSHOT_STALE");
    const debt = rows.find((row) => row.code === "DSR_HIGH_WARN");

    expect(simulate).toBeDefined();
    expect(simulate?.message).toBe(REASON_CODE_MESSAGES_KO.NEGATIVE_CASHFLOW);
    expect(simulate?.count).toBe(2);

    expect(health).toBeDefined();
    expect(health?.message).toContain("스냅샷");
    expect(health?.count).toBe(2);

    expect(debt).toBeDefined();
    expect(debt?.message).toBe(debtStrategyWarningMessage("DSR_HIGH_WARN"));
    expect(debt?.count).toBe(1);
  });

  it("falls back safely for unknown warning codes", () => {
    const run = buildRun({
      outputs: {
        simulate: {
          ref: {
            name: "simulate",
            path: ".data/test/report-dashboard-warnings/run-1/simulate.json",
          },
          warnings: ["UNKNOWN_CUSTOM_WARNING"],
        },
      },
    });

    const rows = aggregateReportWarningsFromRun(run);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe("알 수 없는 경고 (UNKNOWN_CUSTOM_WARNING)");
  });
});
