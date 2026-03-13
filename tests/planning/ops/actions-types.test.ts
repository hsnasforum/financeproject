import { describe, expect, it } from "vitest";
import { OPS_ACTION_IDS, isOpsActionId } from "../../../src/lib/ops/actions/types";

describe("ops action id guard", () => {
  it("accepts every registered ops action id", () => {
    for (const actionId of OPS_ACTION_IDS) {
      expect(isOpsActionId(actionId)).toBe(true);
    }
  });

  it("rejects non-registered action ids", () => {
    expect(isOpsActionId("NOT_IMPLEMENTED")).toBe(false);
    expect(isOpsActionId("UNKNOWN_ACTION")).toBe(false);
    expect(isOpsActionId("")).toBe(false);
    expect(isOpsActionId(null)).toBe(false);
  });
});
