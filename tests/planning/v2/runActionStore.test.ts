import { describe, expect, it } from "vitest";
import {
  buildRunActionPlanItemsFromActionItems,
  createRunActionKey,
  summarizeRunActionProgress,
} from "../../../src/lib/planning/store/runActionStore";
import { type ActionItemV2 } from "../../../src/lib/planning/v2/actions/types";

describe("runActionStore", () => {
  it("creates deterministic action keys from same input", () => {
    const a = createRunActionKey({
      sourceActionId: "SET_ASSUMPTIONS_REVIEW",
      title: "가정 스냅샷 최신화",
      href: "/ops/assumptions",
      index: 0,
    });
    const b = createRunActionKey({
      sourceActionId: "SET_ASSUMPTIONS_REVIEW",
      title: "가정 스냅샷 최신화",
      href: "/ops/assumptions",
      index: 0,
    });
    const c = createRunActionKey({
      sourceActionId: "SET_ASSUMPTIONS_REVIEW",
      title: "가정 스냅샷 최신화",
      href: "/ops/assumptions",
      index: 1,
    });

    expect(a).toBe(b);
    expect(a).toBe("SET_ASSUMPTIONS_REVIEW");
    expect(c).toBe("SET_ASSUMPTIONS_REVIEW");
  });

  it("computes completion percentage from action statuses", () => {
    const summary = summarizeRunActionProgress({
      version: 1,
      runId: "run-1",
      updatedAt: "2026-03-02T00:00:00.000Z",
      items: [
        { actionKey: "act_1", status: "done", updatedAt: "2026-03-02T00:00:00.000Z" },
        { actionKey: "act_2", status: "done", updatedAt: "2026-03-02T00:00:00.000Z" },
        { actionKey: "act_3", status: "doing", updatedAt: "2026-03-02T00:00:00.000Z" },
        { actionKey: "act_4", status: "todo", updatedAt: "2026-03-02T00:00:00.000Z" },
      ],
    });

    expect(summary.total).toBe(4);
    expect(summary.done).toBe(2);
    expect(summary.doing).toBe(1);
    expect(summary.todo).toBe(1);
    expect(summary.snoozed).toBe(0);
    expect(summary.completionPct).toBe(50);
  });

  it("builds deterministic action plan items from ActionItemV2 list using code as actionKey", () => {
    const actions: ActionItemV2[] = [
      {
        code: "FIX_NEGATIVE_CASHFLOW",
        severity: "critical",
        title: "월 현금흐름 정상화",
        summary: "적자 구간을 줄입니다.",
        why: [],
        metrics: {},
        steps: ["선택지출 10% 감소", "1개월 후 재실행"],
        cautions: [],
      },
      {
        code: "SET_ASSUMPTIONS_REVIEW",
        severity: "warn",
        title: "가정 최신화",
        summary: "스냅샷을 최신으로 동기화합니다.",
        why: [],
        metrics: {},
        steps: ["ops/assumptions 이동", "동기화 실행"],
        cautions: [],
      },
    ];

    const planA = buildRunActionPlanItemsFromActionItems(actions);
    const planB = buildRunActionPlanItemsFromActionItems(actions);

    expect(planA.map((item) => item.actionKey)).toEqual([
      "FIX_NEGATIVE_CASHFLOW",
      "SET_ASSUMPTIONS_REVIEW",
    ]);
    expect(planA).toEqual(planB);
  });
});
