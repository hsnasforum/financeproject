import { describe, expect, it } from "vitest";
import { summarizeDoctorChecks, type DoctorCheck } from "../../../src/lib/ops/doctorChecks";

describe("summarizeDoctorChecks", () => {
  it("returns ok=false when any FAIL exists", () => {
    const checks: DoctorCheck[] = [
      { id: "a", title: "A", status: "PASS", message: "ok" },
      { id: "b", title: "B", status: "WARN", message: "warn" },
      { id: "c", title: "C", status: "FAIL", message: "fail" },
    ];

    const report = summarizeDoctorChecks(checks, "2026-03-01T00:00:00.000Z");

    expect(report.ok).toBe(false);
    expect(report.generatedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(report.summary).toEqual({ pass: 1, warn: 1, fail: 1 });
    expect(report.checks).toHaveLength(3);
  });

  it("returns ok=true when there is no FAIL", () => {
    const checks: DoctorCheck[] = [
      { id: "a", title: "A", status: "PASS", message: "ok" },
      { id: "b", title: "B", status: "WARN", message: "warn" },
    ];

    const report = summarizeDoctorChecks(checks);

    expect(report.ok).toBe(true);
    expect(report.summary.pass).toBe(1);
    expect(report.summary.warn).toBe(1);
    expect(report.summary.fail).toBe(0);
  });
});
