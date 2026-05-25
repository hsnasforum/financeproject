import { describe, expect, it } from "vitest";
import {
  REPORT_ADVANCED_RAW_DEFAULT_OPEN,
  resolveReportAdvancedToggleReady,
} from "../../../src/components/planning/reportDashboardReadiness";

describe("reportDashboardReadiness", () => {
  it("keeps the embedded markdown manager hidden by default", () => {
    expect(REPORT_ADVANCED_RAW_DEFAULT_OPEN).toBe(false);
  });

  it("marks the advanced toggle ready only when the selected run is usable", () => {
    expect(resolveReportAdvancedToggleReady({
      clientReady: false,
      loading: false,
      runsCount: 1,
      selectedRunId: "run-1",
      hasSelectedRun: true,
    })).toBe(false);

    expect(resolveReportAdvancedToggleReady({
      clientReady: true,
      loading: true,
      runsCount: 1,
      selectedRunId: "run-1",
      hasSelectedRun: true,
    })).toBe(false);

    expect(resolveReportAdvancedToggleReady({
      clientReady: true,
      loading: false,
      runsCount: 1,
      selectedRunId: "",
      hasSelectedRun: false,
    })).toBe(false);

    expect(resolveReportAdvancedToggleReady({
      clientReady: true,
      loading: false,
      runsCount: 1,
      selectedRunId: "run-1",
      hasSelectedRun: false,
    })).toBe(false);

    expect(resolveReportAdvancedToggleReady({
      clientReady: true,
      loading: false,
      runsCount: 1,
      selectedRunId: "run-1",
      hasSelectedRun: true,
    })).toBe(true);
  });
});
