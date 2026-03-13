import { describe, expect, it } from "vitest";
import {
  buildDefaultAutoRunPolicy,
  OPS_DASHBOARD_AUTO_RUN_ACTIONS,
  gateScheduledAutoRun,
  isAutoRunDue,
  buildDefaultAutoRunSelection,
  normalizeAutoRunPolicy,
  normalizeAutoRunSelection,
  resolveScheduledAutoRunActions,
  selectEnabledAutoRunActions,
  toOpsActionErrorMessage,
} from "../../../src/lib/ops/dashboard/autoRun";

describe("ops dashboard auto-run helpers", () => {
  it("builds safe default selection", () => {
    const selection = buildDefaultAutoRunSelection();
    expect(selection.ASSUMPTIONS_REFRESH).toBe(true);
    expect(selection.REPAIR_INDEX).toBe(false);
    expect(selection.RUN_MIGRATIONS).toBe(false);
    expect(selection.RUNS_CLEANUP).toBe(false);
  });

  it("returns enabled actions in configured order", () => {
    const selection = {
      ASSUMPTIONS_REFRESH: false,
      REPAIR_INDEX: true,
      RUN_MIGRATIONS: false,
      RUNS_CLEANUP: true,
    };
    const enabled = selectEnabledAutoRunActions(selection);
    expect(enabled.map((item) => item.id)).toEqual(["REPAIR_INDEX", "RUNS_CLEANUP"]);
    expect(enabled.every((item) => OPS_DASHBOARD_AUTO_RUN_ACTIONS.some((candidate) => candidate.id === item.id))).toBe(true);
  });

  it("filters dangerous actions for scheduled run when includeDangerous=false", () => {
    const selected = OPS_DASHBOARD_AUTO_RUN_ACTIONS.filter((action) => (
      action.id === "ASSUMPTIONS_REFRESH" || action.id === "RUNS_CLEANUP"
    ));
    const safeOnly = resolveScheduledAutoRunActions(selected, false);
    expect(safeOnly.map((item) => item.id)).toEqual(["ASSUMPTIONS_REFRESH"]);
    const withDangerous = resolveScheduledAutoRunActions(selected, true);
    expect(withDangerous.map((item) => item.id)).toEqual(["ASSUMPTIONS_REFRESH", "RUNS_CLEANUP"]);
  });

  it("normalizes persisted auto-run selection against known action ids", () => {
    const parsed = normalizeAutoRunSelection({
      ASSUMPTIONS_REFRESH: false,
      RUNS_CLEANUP: true,
      UNKNOWN_ACTION: true,
    });
    expect(parsed.ASSUMPTIONS_REFRESH).toBe(false);
    expect(parsed.RUNS_CLEANUP).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, "UNKNOWN_ACTION")).toBe(false);
  });

  it("normalizes auto-run policy with safe defaults", () => {
    const fallback = buildDefaultAutoRunPolicy();
    const parsed = normalizeAutoRunPolicy({
      enabled: true,
      intervalMinutes: 60,
      includeDangerous: true,
    }, fallback);
    expect(parsed).toEqual({
      enabled: true,
      intervalMinutes: 60,
      includeDangerous: true,
    });

    const invalid = normalizeAutoRunPolicy({ enabled: "1", intervalMinutes: 7 }, fallback);
    expect(invalid).toEqual({
      enabled: false,
      intervalMinutes: fallback.intervalMinutes,
      includeDangerous: false,
    });
  });

  it("computes auto-run due by interval and last run time", () => {
    const now = Date.UTC(2026, 2, 8, 0, 30, 0);
    expect(isAutoRunDue("", 30, now)).toBe(true);
    expect(isAutoRunDue("2026-03-08T00:00:00.000Z", 30, now)).toBe(true);
    expect(isAutoRunDue("2026-03-08T00:20:00.000Z", 30, now)).toBe(false);
  });

  it("treats future timestamps as not due and zero interval as always due", () => {
    const now = Date.UTC(2026, 2, 8, 0, 30, 0);
    expect(isAutoRunDue("2026-03-08T00:40:00.000Z", 30, now)).toBe(false);
    expect(isAutoRunDue("2026-03-08T00:40:00.000Z", 0, now)).toBe(true);
  });

  it("maps guard errors to actionable Korean messages", () => {
    expect(
      toOpsActionErrorMessage(403, { error: { code: "CSRF", message: "csrf invalid" } }, "fallback"),
    ).toContain("보안 토큰");
    expect(
      toOpsActionErrorMessage(403, { error: { code: "LOCAL_ONLY", message: "local only" } }, "fallback"),
    ).toContain("localhost");
    expect(
      toOpsActionErrorMessage(423, { error: { code: "LOCKED", message: "vault locked" } }, "fallback"),
    ).toContain("/ops/security");
  });

  it("falls back to payload message or fallback string", () => {
    expect(
      toOpsActionErrorMessage(500, { error: { code: "UNKNOWN", message: "payload message" } }, "fallback"),
    ).toBe("payload message");
    expect(toOpsActionErrorMessage(500, null, "fallback")).toBe("fallback");
  });

  it("gates scheduled auto-run for policy/csrf/lock/running/not-due/no-action states", () => {
    const policy = { enabled: true, intervalMinutes: 30, includeDangerous: false } as const;
    const selected = OPS_DASHBOARD_AUTO_RUN_ACTIONS.filter((action) => action.id === "ASSUMPTIONS_REFRESH");

    expect(gateScheduledAutoRun({
      policy: { ...policy, enabled: false },
      hasCsrf: true,
      autoRunning: false,
      actionRunningCount: 0,
      lockActive: false,
      selectedActions: selected,
      lastRanAt: null,
    })).toEqual({ ok: false, reason: "policyDisabled" });

    expect(gateScheduledAutoRun({
      policy,
      hasCsrf: false,
      autoRunning: false,
      actionRunningCount: 0,
      lockActive: false,
      selectedActions: selected,
      lastRanAt: null,
    })).toEqual({ ok: false, reason: "csrfMissing" });

    expect(gateScheduledAutoRun({
      policy,
      hasCsrf: true,
      autoRunning: true,
      actionRunningCount: 0,
      lockActive: false,
      selectedActions: selected,
      lastRanAt: null,
    })).toEqual({ ok: false, reason: "alreadyRunning" });

    expect(gateScheduledAutoRun({
      policy,
      hasCsrf: true,
      autoRunning: false,
      actionRunningCount: 1,
      lockActive: false,
      selectedActions: selected,
      lastRanAt: null,
    })).toEqual({ ok: false, reason: "alreadyRunning" });

    expect(gateScheduledAutoRun({
      policy,
      hasCsrf: true,
      autoRunning: false,
      actionRunningCount: 0,
      lockActive: true,
      selectedActions: selected,
      lastRanAt: null,
    })).toEqual({ ok: false, reason: "locked" });

    expect(gateScheduledAutoRun({
      policy,
      hasCsrf: true,
      autoRunning: false,
      actionRunningCount: 0,
      lockActive: false,
      selectedActions: selected,
      lastRanAt: "2026-03-08T00:20:00.000Z",
      nowMs: Date.UTC(2026, 2, 8, 0, 30, 0),
    })).toEqual({ ok: false, reason: "notDue" });

    expect(gateScheduledAutoRun({
      policy: { enabled: true, intervalMinutes: 30, includeDangerous: false },
      hasCsrf: true,
      autoRunning: false,
      actionRunningCount: 0,
      lockActive: false,
      selectedActions: OPS_DASHBOARD_AUTO_RUN_ACTIONS.filter((action) => action.id === "RUNS_CLEANUP"),
      lastRanAt: null,
    })).toEqual({ ok: false, reason: "noActions" });
  });

  it("returns runnable actions when scheduled gate conditions are satisfied", () => {
    const result = gateScheduledAutoRun({
      policy: { enabled: true, intervalMinutes: 30, includeDangerous: false },
      hasCsrf: true,
      autoRunning: false,
      actionRunningCount: 0,
      lockActive: false,
      selectedActions: OPS_DASHBOARD_AUTO_RUN_ACTIONS.filter((action) => action.id === "ASSUMPTIONS_REFRESH"),
      lastRanAt: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.actions.map((item) => item.id)).toEqual(["ASSUMPTIONS_REFRESH"]);
  });
});
