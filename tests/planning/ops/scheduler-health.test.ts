import { describe, expect, it } from "vitest";
import {
  planSchedulerHealthActions,
  toSchedulerRiskEventId,
  type SchedulerHealthState,
} from "../../../src/lib/ops/scheduler/health";
import type { OpsSchedulerEvent, OpsSchedulerSummary } from "../../../src/lib/ops/scheduler/eventLog";

function buildSummary(overrides?: Partial<OpsSchedulerSummary>): OpsSchedulerSummary {
  return {
    total: 3,
    success: 2,
    failed: 1,
    latestAt: "2026-03-08T10:00:00.000Z",
    latestFailed: true,
    consecutiveFailures: 3,
    level: "RISK",
    thresholds: {
      warnConsecutiveFailures: 1,
      riskConsecutiveFailures: 3,
    },
    ...(overrides ?? {}),
  };
}

function buildLatestEvent(overrides?: Partial<OpsSchedulerEvent>): OpsSchedulerEvent {
  return {
    ts: "2026-03-08T10:00:00.000Z",
    mode: "weekly",
    ok: false,
    exitCode: 2,
    startedAt: "2026-03-08T09:59:00.000Z",
    endedAt: "2026-03-08T10:00:00.000Z",
    ...(overrides ?? {}),
  };
}

describe("ops scheduler health planner", () => {
  it("emits risk alert when entering risk with a new failed event", () => {
    const summary = buildSummary();
    const latest = buildLatestEvent();
    const state: SchedulerHealthState = { lastLevel: "WARN" };

    const plan = planSchedulerHealthActions({
      summary,
      latestEvent: latest,
      state,
      nowIso: "2026-03-08T10:01:00.000Z",
    });

    expect(plan.emitRiskAlert).toBe(true);
    expect(plan.emitRecovered).toBe(false);
    expect(plan.riskEventId).toBe(toSchedulerRiskEventId(latest));
    expect(plan.nextState.lastLevel).toBe("RISK");
    expect(plan.nextState.lastRiskEventId).toBe(toSchedulerRiskEventId(latest));
  });

  it("does not emit duplicate risk alert for the same event", () => {
    const summary = buildSummary();
    const latest = buildLatestEvent();
    const state: SchedulerHealthState = {
      lastLevel: "RISK",
      lastRiskEventId: toSchedulerRiskEventId(latest),
    };

    const plan = planSchedulerHealthActions({
      summary,
      latestEvent: latest,
      state,
    });

    expect(plan.emitRiskAlert).toBe(false);
    expect(plan.emitRecovered).toBe(false);
    expect(plan.nextState.lastLevel).toBe("RISK");
  });

  it("emits recovered event when risk level is cleared", () => {
    const summary = buildSummary({
      level: "WARN",
      latestFailed: false,
      consecutiveFailures: 0,
    });
    const latest = buildLatestEvent({ ok: true, exitCode: 0 });
    const state: SchedulerHealthState = {
      lastLevel: "RISK",
      lastRiskEventId: "old-risk-event-id",
    };

    const plan = planSchedulerHealthActions({
      summary,
      latestEvent: latest,
      state,
    });

    expect(plan.emitRiskAlert).toBe(false);
    expect(plan.emitRecovered).toBe(true);
    expect(plan.nextState.lastLevel).toBe("WARN");
  });
});
