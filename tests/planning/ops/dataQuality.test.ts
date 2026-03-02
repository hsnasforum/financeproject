import { describe, expect, it } from "vitest";
import { evaluateDartCorpIndexQuality, evaluateFinlifeSnapshotQuality } from "../../../src/lib/ops/dataQuality";
import type { FinlifeSnapshot } from "../../../src/lib/finlife/snapshot";
import type { CorpCodeIndexV1 } from "../../../src/lib/publicApis/dart/corpIndex";

describe("dataQuality", () => {
  it("flags bad finlife snapshot rows (missing, duplicate, rate anomaly)", () => {
    const snapshot: FinlifeSnapshot = {
      meta: {
        generatedAt: "2026-03-01T00:00:00.000Z",
        ttlMs: 86_400_000,
        groupsScanned: ["020000"],
        pagesFetchedByGroup: { "020000": 1 },
        totalProducts: 3,
        totalOptions: 4,
        completionRate: 1,
        truncatedByHardCap: false,
        source: "finlife",
      },
      items: [
        {
          fin_prdt_cd: "A1",
          kor_co_nm: "은행A",
          fin_prdt_nm: "예금A",
          options: [
            { save_trm: "12", intr_rate: 2.5, intr_rate2: 3.1, raw: {} },
            { save_trm: "12", intr_rate: 2.6, intr_rate2: 3.2, raw: {} },
          ],
          raw: {},
        },
        {
          fin_prdt_cd: "B1",
          kor_co_nm: "",
          fin_prdt_nm: "예금B",
          options: [{ save_trm: "24", intr_rate: -1, intr_rate2: 2.0, raw: {} }],
          raw: {},
        },
        {
          fin_prdt_cd: "C1",
          kor_co_nm: "은행C",
          fin_prdt_nm: "예금C",
          options: [{ save_trm: "36", intr_rate: "NaN" as unknown as number, intr_rate2: 101, raw: {} }],
          raw: {},
        },
      ],
    };

    const report = evaluateFinlifeSnapshotQuality("finlife:deposit", snapshot, {
      now: new Date("2026-03-02T00:00:00.000Z"),
      staleWarnDays: 30,
    });

    expect(report.status).toBe("FAIL");
    expect(report.totals.missingRequired).toBeGreaterThan(0);
    expect(report.totals.duplicates).toBeGreaterThan(0);
    expect(report.totals.rateAnomalies).toBeGreaterThan(0);
    expect(report.issues.map((issue) => issue.code)).toContain("MISSING_REQUIRED");
    expect(report.issues.map((issue) => issue.code)).toContain("DUPLICATE_KEY");
    expect(report.issues.map((issue) => issue.code)).toContain("RATE_ANOMALY");
  });

  it("passes good finlife + dart datasets and warns on stale dart index", () => {
    const goodFinlife: FinlifeSnapshot = {
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
          kor_co_nm: "은행A",
          fin_prdt_nm: "예금A",
          options: [
            { save_trm: "12", intr_rate: 2.5, intr_rate2: 3.1, raw: {} },
            { save_trm: "24", intr_rate: 2.7, intr_rate2: 3.3, raw: {} },
          ],
          raw: {},
        },
      ],
    };

    const finlifeReport = evaluateFinlifeSnapshotQuality("finlife:saving", goodFinlife, {
      now: new Date("2026-03-02T00:00:00.000Z"),
      staleWarnDays: 30,
    });
    expect(finlifeReport.status).toBe("PASS");
    expect(finlifeReport.issues).toHaveLength(0);

    const goodDart: CorpCodeIndexV1 = {
      version: 1,
      generatedAt: "2026-03-02T00:00:00.000Z",
      count: 2,
      items: [
        { corpCode: "001", corpName: "회사A", normName: "회사a", stockCode: "111111" },
        { corpCode: "002", corpName: "회사B", normName: "회사b", stockCode: "222222" },
      ],
    };

    const dartPass = evaluateDartCorpIndexQuality(goodDart, {
      now: new Date("2026-03-02T00:00:00.000Z"),
      staleWarnDays: 14,
    });
    expect(dartPass.status).toBe("PASS");

    const staleDart = evaluateDartCorpIndexQuality({ ...goodDart, generatedAt: "2026-01-01T00:00:00.000Z" }, {
      now: new Date("2026-03-02T00:00:00.000Z"),
      staleWarnDays: 14,
    });
    expect(staleDart.status).toBe("WARN");
    expect(staleDart.issues.map((issue) => issue.code)).toContain("STALE_TIMESTAMP");
  });
});
