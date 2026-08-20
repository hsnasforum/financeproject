import { describe, expect, it } from "vitest";
import { escapeCsvCell, exportRunCsv, exportRunJson, type SavedRecommendRun } from "../src/lib/recommend/savedRunsStore";
import { recommendOwnerId } from "../src/lib/recommend/ownerNamespace";

const OWNER_ID = recommendOwnerId("alice");

function sampleRun(): SavedRecommendRun {
  return {
    ownerId: OWNER_ID,
    runId: "run_20260225_abcd12",
    savedAt: "2026-02-25T12:34:56.000Z",
    profile: {
      purpose: "seed-money",
      kind: "deposit",
      preferredTerm: 12,
      liquidityPref: "mid",
      rateMode: "max",
      topN: 5,
      candidatePool: "unified",
      candidateSources: ["finlife", "datago_kdb"],
      depositProtection: "any",
      weights: { rate: 0.55, term: 0.3, liquidity: 0.15 },
    },
    items: [
      {
        unifiedId: "finlife:001",
        providerName: "은행,테스트",
        productName: "상품 \"A\"\n특판",
        kind: "deposit",
        termMonths: 12,
        appliedRate: 3.45,
        rank: 1,
        finalScore: 0.9123,
      },
    ],
  };
}

describe("csv export", () => {
  it("escapes comma/quotes/newline", () => {
    expect(escapeCsvCell("plain")).toBe("plain");
    expect(escapeCsvCell("a,b")).toBe("\"a,b\"");
    expect(escapeCsvCell("a\"b")).toBe("\"a\"\"b\"");
    expect(escapeCsvCell("a\nb")).toBe("\"a\nb\"");
  });

  it("exports run as escaped csv rows", () => {
    const csv = exportRunCsv(OWNER_ID, sampleRun());
    const [header] = csv.split("\n");

    expect(header).toContain("runId");
    expect(header).toContain("unifiedId");
    expect(csv).toContain("\"은행,테스트\"");
    expect(csv).toContain("\"상품 \"\"A\"\"\n특판\"");
    expect(csv).toContain("finlife:001");
    expect(csv).toContain("0.9123");
  });

  it("does not expose the owner identifier in exported JSON", () => {
    const exported = JSON.parse(exportRunJson(OWNER_ID, sampleRun())) as Record<string, unknown>;
    expect(exported.ownerId).toBeUndefined();
    expect(exported.runId).toBe("run_20260225_abcd12");
    expect(() => exportRunJson(recommendOwnerId("bob"), sampleRun())).toThrow("owner mismatch");
  });
});
