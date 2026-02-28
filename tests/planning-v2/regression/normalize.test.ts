import { describe, expect, it } from "vitest";
import { normalizePlanResultForTest } from "../../../src/lib/planning/v2/regression/normalize";

describe("normalizePlanResultForTest", () => {
  it("removes unstable meta fields and sorts warning/action arrays", () => {
    const input = {
      meta: {
        generatedAt: "2026-02-28T12:00:00.000Z",
        snapshot: {
          asOf: "2026-02-28",
          fetchedAt: "2026-02-28T12:00:00.000Z",
        },
      },
      data: {
        warnings: [
          { reasonCode: "GOAL_MISSED" },
          { reasonCode: "NEGATIVE_CASHFLOW" },
        ],
        healthWarnings: [
          { code: "OPTIMISTIC_RETURN" },
          { code: "SNAPSHOT_STALE" },
        ],
        actions: [
          { code: "SET_ASSUMPTIONS_REVIEW" },
          { code: "FIX_NEGATIVE_CASHFLOW" },
        ],
      },
    };

    const normalized = normalizePlanResultForTest(input) as {
      meta?: { generatedAt?: string; snapshot?: { fetchedAt?: string } };
      data?: {
        warnings?: Array<{ reasonCode?: string }>;
        healthWarnings?: Array<{ code?: string }>;
        actions?: Array<{ code?: string }>;
      };
    };

    expect(normalized.meta?.generatedAt).toBeUndefined();
    expect(normalized.meta?.snapshot?.fetchedAt).toBeUndefined();

    expect(normalized.data?.warnings?.map((item) => item.reasonCode)).toEqual([
      "GOAL_MISSED",
      "NEGATIVE_CASHFLOW",
    ]);
    expect(normalized.data?.healthWarnings?.map((item) => item.code)).toEqual([
      "OPTIMISTIC_RETURN",
      "SNAPSHOT_STALE",
    ]);
    expect(normalized.data?.actions?.map((item) => item.code)).toEqual([
      "FIX_NEGATIVE_CASHFLOW",
      "SET_ASSUMPTIONS_REVIEW",
    ]);
  });
});
