import { describe, expect, it } from "vitest";
import {
  BENEFITS_FLOW_COPY,
  benefitResultSummary,
  buildBenefitsSnapshotStatus,
  readBenefitErrorMessage,
  sanitizeBenefitUserMessage,
} from "../src/lib/publicApis/benefitsFlowContract";

describe("benefits/gov24 shared flow contract", () => {
  it("hides internal commands and dev endpoints from user-facing messages", () => {
    expect(sanitizeBenefitUserMessage("Run pnpm gov24:sync:if-stale")).toBe(BENEFITS_FLOW_COPY.requestFailed);
    expect(sanitizeBenefitUserMessage("/api/dev/benefits/snapshot/refresh 를 먼저 실행하세요.")).toBe(BENEFITS_FLOW_COPY.requestFailed);
    expect(readBenefitErrorMessage({ error: { message: "조건을 다시 확인해 주세요." } })).toBe("조건을 다시 확인해 주세요.");
  });

  it("builds the same snapshot-missing status for benefits and gov24 fallback meta", () => {
    expect(buildBenefitsSnapshotStatus({
      fallback: { reason: "snapshot_missing" },
      message: BENEFITS_FLOW_COPY.snapshotMissing,
    })).toMatchObject({
      state: "needs_sync",
      stateLabel: "기준 데이터 준비 필요",
      notice: BENEFITS_FLOW_COPY.snapshotMissing,
    });
  });

  it("keeps stale snapshot guidance distinct from a missing snapshot", () => {
    expect(buildBenefitsSnapshotStatus({
      fallback: { reason: "snapshot_stale" },
      sync: { state: "needs_sync" },
      snapshot: {
        totalItems: 25,
        generatedAt: "2026-07-01T00:00:00.000Z",
      },
      message: BENEFITS_FLOW_COPY.snapshotStale,
    })).toMatchObject({
      state: "needs_sync",
      stateLabel: "기준 시점 오래됨",
      totalItems: 25,
      generatedAt: "2026-07-01T00:00:00.000Z",
      notice: BENEFITS_FLOW_COPY.snapshotStale,
      isStale: true,
    });
  });

  it("preserves stale status when Gov24 rebuilds status from the previous payload", () => {
    const initial = buildBenefitsSnapshotStatus({
      snapshot: {
        totalItems: 25,
        generatedAt: "2026-07-01T00:00:00.000Z",
      },
      sync: { state: "needs_sync" },
      fallback: { reason: "snapshot_stale" },
      message: BENEFITS_FLOW_COPY.snapshotStale,
    });

    const rerendered = buildBenefitsSnapshotStatus({
      snapshot: {
        totalItems: initial.totalItems ?? undefined,
        generatedAt: initial.generatedAt ?? undefined,
        isStale: initial.isStale,
      },
      sync: { state: "needs_sync" },
      message: initial.notice,
    });

    expect(rerendered).toMatchObject({
      state: "needs_sync",
      stateLabel: "기준 시점 오래됨",
      isStale: true,
      notice: BENEFITS_FLOW_COPY.snapshotStale,
    });
  });

  it("normalizes ready and partial snapshot metadata", () => {
    expect(buildBenefitsSnapshotStatus({
      snapshot: {
        totalItemsInSnapshot: 123,
        uniqueCount: 120,
        completionRate: 0.8,
        generatedAt: "2026-07-01T00:00:00.000Z",
      },
    })).toMatchObject({
      state: "partial",
      totalItems: 123,
      uniqueCount: 120,
      completionRate: 0.8,
      generatedAt: "2026-07-01T00:00:00.000Z",
    });

    expect(buildBenefitsSnapshotStatus({
      generatedAt: "2026-07-01T00:00:00.000Z",
      snapshotTotal: 12,
    })).toMatchObject({
      state: "ready",
      totalItems: 12,
      notice: null,
    });
  });

  it("uses shared result summary copy", () => {
    expect(benefitResultSummary({ surface: "benefits", totalMatched: 3 })).toBe("3건의 혜택 후보");
    expect(benefitResultSummary({ surface: "gov24", totalMatched: 3 })).toBe("현재 조건 기준 3건의 혜택 후보를 읽는 중입니다.");
  });
});
