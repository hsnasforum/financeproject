import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFeedback,
  deleteFeedback,
  getFeedback,
  listFeedback,
  updateFeedback,
} from "../../../src/lib/ops/feedback/planningFeedbackStore";

const env = process.env as Record<string, string | undefined>;
const originalFeedbackDir = process.env.PLANNING_FEEDBACK_DIR;

function feedbackInput() {
  return {
    from: { screen: "/planning" },
    context: {
      snapshot: {
        id: "snap-1",
        asOf: "2026-02-28",
        fetchedAt: "2026-02-28T00:00:00.000Z",
        missing: false,
      },
      runId: "run-1",
      health: {
        criticalCount: 0,
        warningsCodes: ["WARN_SAMPLE"],
      },
    },
    content: {
      category: "bug" as const,
      title: "저장 버튼 반응 지연",
      message: "실행 후 저장 버튼을 눌렀을 때 반응이 늦게 보입니다.",
    },
  };
}

describe("planning feedback store", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-feedback-store-"));
    env.PLANNING_FEEDBACK_DIR = path.join(root, "feedback");
  });

  afterEach(() => {
    if (typeof originalFeedbackDir === "string") env.PLANNING_FEEDBACK_DIR = originalFeedbackDir;
    else delete env.PLANNING_FEEDBACK_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("supports create/list/update/delete flow", async () => {
    const created = await createFeedback(feedbackInput());

    expect(created.id).toBeTruthy();
    expect(created.version).toBe(1);
    expect(created.triage.status).toBe("new");
    expect(created.triage.priority).toBe("p2");

    const listed = await listFeedback();
    expect(listed.some((row) => row.id === created.id)).toBe(true);

    const updated = await updateFeedback(created.id, {
      triage: {
        status: "triaged",
        priority: "p1",
        tags: ["ux", "planning"],
        due: "2026-03-31",
      },
    });

    expect(updated?.triage.status).toBe("triaged");
    expect(updated?.triage.priority).toBe("p1");
    expect(updated?.triage.tags).toEqual(["ux", "planning"]);
    expect(updated?.triage.due).toBe("2026-03-31");

    const loaded = await getFeedback(created.id);
    expect(loaded?.id).toBe(created.id);

    const onlyTriaged = await listFeedback({ status: "triaged" });
    expect(onlyTriaged.map((row) => row.id)).toContain(created.id);

    const deleted = await deleteFeedback(created.id);
    expect(deleted).toBe(true);
    expect(await getFeedback(created.id)).toBeNull();
  });
});
