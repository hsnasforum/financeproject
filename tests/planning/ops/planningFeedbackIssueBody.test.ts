import { afterEach, describe, expect, it } from "vitest";
import { buildIssueFromFeedback } from "../../../src/lib/ops/feedback/issueBody";
import type { PlanningFeedback } from "../../../src/lib/ops/feedback/planningFeedbackTypes";

const env = process.env as Record<string, string | undefined>;
const originalPrefix = process.env.PLANNING_FEEDBACK_ISSUE_PREFIX;
const originalLabels = process.env.PLANNING_FEEDBACK_ISSUE_LABELS;

function fixture(): PlanningFeedback {
  return {
    version: 1,
    id: "fb-1",
    createdAt: "2026-03-01T00:00:00.000Z",
    from: { screen: "/planning" },
    context: {
      snapshot: {
        id: "snap-2026-02-28",
        asOf: "2026-02-28",
        fetchedAt: "2026-02-28T00:00:00.000Z",
        missing: false,
      },
      runId: "run-123",
      reportId: "report-456",
      health: {
        criticalCount: 1,
        warningsCodes: ["WARN_A", "WARN_B", "WARN_C"],
      },
    },
    content: {
      category: "bug",
      title: "저장 버튼 반응 지연",
      message: "1. 실행 후 저장 버튼 클릭\n2. 로딩이 길게 보임\n내부 경로 .data/planning/profiles/abc 와 Bearer secret-token 노출은 제거되어야 함",
    },
    triage: {
      status: "triaged",
      priority: "p1",
      tags: ["ui"],
    },
  };
}

afterEach(() => {
  if (typeof originalPrefix === "string") env.PLANNING_FEEDBACK_ISSUE_PREFIX = originalPrefix;
  else delete env.PLANNING_FEEDBACK_ISSUE_PREFIX;

  if (typeof originalLabels === "string") env.PLANNING_FEEDBACK_ISSUE_LABELS = originalLabels;
  else delete env.PLANNING_FEEDBACK_ISSUE_LABELS;
});

describe("planning feedback issue body", () => {
  it("builds title/body/labels and masks sensitive markers", () => {
    env.PLANNING_FEEDBACK_ISSUE_PREFIX = "[Planning v2]";
    env.PLANNING_FEEDBACK_ISSUE_LABELS = "planning,feedback";

    const built = buildIssueFromFeedback(fixture());

    expect(built.title).toContain("[Planning v2]");
    expect(built.title).toContain("저장 버튼 반응 지연");

    expect(built.body).toContain("snapshotRef: id=snap-2026-02-28");
    expect(built.body).toContain("runId: run-123");
    expect(built.body).toContain("reportId: report-456");
    expect(built.body).toContain("health.criticalCount: 1");
    expect(built.body).toContain("health.warningsCodes(top5): WARN_A, WARN_B, WARN_C");

    expect(built.body).not.toContain(".data/");
    expect(built.body).not.toContain("Bearer secret-token");
    expect(built.body).toContain("<DATA_PATH>");
    expect(built.body).toContain("Bearer ***");

    expect(built.labels).toContain("planning");
    expect(built.labels).toContain("feedback");
    expect(built.labels).toContain("bug");
    expect(built.labels).toContain("p1");
  });
});
