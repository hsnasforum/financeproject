import { describe, expect, it } from "vitest";
import { buildDoctorIssues, sortDoctorIssues } from "../../../src/lib/ops/doctorIssues";
import { type DoctorCheck } from "../../../src/lib/ops/doctorChecks";

describe("doctorIssues", () => {
  it("sorts issues by severity priority (risk > warn > info)", () => {
    const checks: DoctorCheck[] = [
      { id: "a", title: "A", status: "PASS", message: "ok", fixHref: "/ops" },
      { id: "b", title: "B", status: "WARN", message: "warn", fixHref: "/ops" },
      { id: "c", title: "C", status: "FAIL", message: "fail", fixHref: "/ops" },
      { id: "d", title: "D", status: "WARN", message: "warn2", fixHref: "/ops" },
    ];

    const issues = sortDoctorIssues(buildDoctorIssues(checks, "2026-03-02T00:00:00.000Z"));

    expect(issues.map((row) => row.checkId)).toEqual(["c", "b", "d", "a"]);
    expect(issues[0]?.severity).toBe("risk");
    expect(issues[1]?.severity).toBe("warn");
    expect(issues[3]?.severity).toBe("info");
  });
});
