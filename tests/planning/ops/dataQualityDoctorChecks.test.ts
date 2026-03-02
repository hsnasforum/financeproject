import { describe, expect, it } from "vitest";
import {
  buildExternalDataQualityDoctorChecks,
  evaluateFinlifeSnapshotQuality,
} from "../../../src/lib/ops/dataQuality";
import { type FinlifeSnapshot } from "../../../src/lib/finlife/snapshot";

describe("buildExternalDataQualityDoctorChecks", () => {
  it("returns FAIL status for bad finlife fixture with expected check ids", () => {
    const badSnapshot: FinlifeSnapshot = {
      meta: {
        generatedAt: "2026-03-01T00:00:00.000Z",
        ttlMs: 86_400_000,
        groupsScanned: ["020000"],
        pagesFetchedByGroup: { "020000": 1 },
        totalProducts: 1,
        totalOptions: 2,
        completionRate: 1,
        truncatedByHardCap: false,
        source: "finlife",
      },
      items: [
        {
          fin_prdt_cd: "A1",
          kor_co_nm: "",
          fin_prdt_nm: "예금A",
          options: [
            { save_trm: "0", intr_rate: 2.5, intr_rate2: 3.1, raw: {} },
            { save_trm: "12", intr_rate: 150, intr_rate2: 3.2, raw: {} },
          ],
          raw: {},
        },
      ],
    };

    const dataset = evaluateFinlifeSnapshotQuality("finlife:deposit", badSnapshot, {
      now: new Date("2026-03-02T00:00:00.000Z"),
      staleWarnDays: 30,
    });
    const checks = buildExternalDataQualityDoctorChecks({
      checkedAt: "2026-03-02T00:00:00.000Z",
      overallStatus: "FAIL",
      summary: { pass: 0, warn: 0, fail: 1 },
      datasets: [dataset],
    });
    expect(checks).toHaveLength(1);
    expect(checks[0]?.id).toBe("FINLIFE_DEPOSIT_QUALITY");
    expect(checks[0]?.status).toBe("FAIL");
    expect(checks[0]?.message).toContain("invalidSchema");
  });
});
