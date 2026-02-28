import { describe, expect, it } from "vitest";
import { buildReleasePlan } from "../../../src/lib/planning/release/plan";

describe("buildReleasePlan", () => {
  it("builds run steps including acceptance when baseUrl is provided", () => {
    const plan = buildReleasePlan({
      version: "0.1.0",
      baseUrl: "http://localhost:3100/",
    });

    expect(plan.version).toBe("0.1.0");
    expect(plan.baseUrl).toBe("http://localhost:3100");
    expect(plan.steps.map((step) => step.id)).toEqual([
      "complete",
      "acceptance",
      "release-notes",
      "evidence-bundle",
    ]);

    const acceptance = plan.steps[1];
    expect(acceptance.willRun).toBe(true);
    expect(acceptance.env).toEqual({
      PLANNING_BASE_URL: "http://localhost:3100",
    });
  });

  it("marks acceptance as skipped when baseUrl is not provided", () => {
    const plan = buildReleasePlan({
      version: "0.2.0",
    });

    const acceptance = plan.steps[1];
    expect(acceptance.id).toBe("acceptance");
    expect(acceptance.willRun).toBe(false);
    expect(acceptance.note).toBe("base-url-not-provided");
    expect(plan.artifacts.releaseNotesPath).toBe("docs/releases/planning-v2-0.2.0.md");
    expect(plan.artifacts.evidenceBundlePath).toBe(".data/planning/release/planning-v2-evidence-0.2.0.tar.gz");
  });
});

