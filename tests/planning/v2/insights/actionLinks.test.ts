import { describe, expect, it } from "vitest";
import { resolveInterpretationActionHref } from "../../../../src/lib/planning/v2/insights/actionLinks";

describe("resolveInterpretationActionHref", () => {
  it("maps key action ids to stable section or ops links", () => {
    expect(resolveInterpretationActionHref("SET_ASSUMPTIONS_REVIEW")).toBe("/ops/assumptions");
    expect(resolveInterpretationActionHref("REDUCE_DEBT_SERVICE")).toBe("#warnings");
    expect(resolveInterpretationActionHref("OPEN_CANDIDATE_COMPARISON")).toBe("#candidates");
    expect(resolveInterpretationActionHref("INPUT_REVIEW")).toBe("#evidence");
  });

  it("builds action-center link with runId when provided", () => {
    const href = resolveInterpretationActionHref("MANAGE_ACTION_CENTER", { runId: "run-abc" });
    expect(href).toBe("/planning/runs?runId=run-abc#action-center");
  });
});
