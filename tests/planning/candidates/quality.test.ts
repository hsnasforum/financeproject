import { describe, expect, it } from "vitest";
import {
  CandidateVMSchema,
  checkFinlifeQuality,
  type CandidateVM,
} from "../../../src/lib/planning/candidates/quality";

describe("CandidateVMSchema", () => {
  it("rejects invalid candidate rows", () => {
    const invalid = CandidateVMSchema.safeParse({
      providerName: "",
      productName: "  ",
      termMonths: 0,
      baseRatePct: Number.NaN,
    });
    expect(invalid.success).toBe(false);
  });
});

describe("checkFinlifeQuality", () => {
  it("dedupes and flags anomalies", () => {
    const candidates: CandidateVM[] = [
      {
        providerName: "은행A",
        productName: "예금A",
        termMonths: 12,
        baseRatePct: 2.5,
      },
      {
        providerName: "은행A",
        productName: "예금A",
        termMonths: 12,
        baseRatePct: 2.7,
      },
      {
        providerName: "은행B",
        productName: "예금B",
        termMonths: 0,
        baseRatePct: 3.1,
      },
      {
        providerName: "은행C",
        productName: "예금C",
        termMonths: 24,
        baseRatePct: 150,
      },
    ];

    const report = checkFinlifeQuality("deposit", candidates, { duplicateWarnThreshold: 0 });
    expect(report.counts.total).toBe(4);
    expect(report.counts.duplicates).toBeGreaterThan(0);
    expect(report.counts.termAnomalies).toBeGreaterThan(0);
    expect(report.counts.rateAnomalies).toBeGreaterThan(0);
    expect(report.status).toBe("RISK");
    expect(report.samples.length).toBeGreaterThan(0);
  });
});
