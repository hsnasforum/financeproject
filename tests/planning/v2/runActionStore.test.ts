import { describe, expect, it } from "vitest";
import { createRunActionKey, summarizeRunActionProgress } from "../../../src/lib/planning/store/runActionStore";

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
    expect(a).not.toBe(c);
    expect(a.startsWith("act_")).toBe(true);
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
});
