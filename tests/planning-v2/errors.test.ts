import { describe, expect, it } from "vitest";
import { toPlanningError } from "../../src/lib/planning/v2/errors";
import { ko } from "../../src/lib/planning/v2/messages.ko";
import { PlanningV2ValidationError } from "../../src/lib/planning/v2/types";

describe("planning v2 errors", () => {
  it("maps unknown error to INTERNAL", () => {
    const error = toPlanningError(new Error("boom"));
    expect(error.code).toBe("INTERNAL");
    expect(error.message).toBe(ko.INTERNAL);
  });

  it("maps validation error to INPUT", () => {
    const error = toPlanningError(new PlanningV2ValidationError("Invalid profile", [
      { path: "profile", message: "must be an object" },
    ]));
    expect(error.code).toBe("INPUT");
    expect(error.message).toBe(ko.INPUT);
  });

  it("maps guard-style csrf/local codes", () => {
    const localOnly = toPlanningError({ code: "ORIGIN_MISMATCH", message: "동일 origin" });
    const csrf = toPlanningError({ code: "CSRF_MISMATCH", message: "CSRF 검증 실패" });

    expect(localOnly.code).toBe("LOCAL_ONLY");
    expect(localOnly.message).toBe(ko.LOCAL_ONLY);

    expect(csrf.code).toBe("CSRF");
    expect(csrf.message).toBe(ko.CSRF);
  });

  it("has korean messages for all standard planning error codes", () => {
    expect(ko.INPUT).toBeTruthy();
    expect(ko.SNAPSHOT_NOT_FOUND).toBeTruthy();
    expect(ko.SNAPSHOT_MISSING).toBeTruthy();
    expect(ko.BUDGET_EXCEEDED).toBeTruthy();
    expect(ko.DISABLED).toBeTruthy();
    expect(ko.LOCAL_ONLY).toBeTruthy();
    expect(ko.CSRF).toBeTruthy();
    expect(ko.INTERNAL).toBeTruthy();
  });
});
