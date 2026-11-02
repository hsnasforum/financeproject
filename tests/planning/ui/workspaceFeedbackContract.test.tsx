import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlanningWorkspaceModalPanel } from "../../../src/components/planning/workspace/panels/modalPanel";
import type { PlanningWorkspaceGroups } from "../../../src/components/planning/workspace/groups";

function renderFeedbackModal(input: { title: string; message: string }): string {
  const dialogs = {
    profileDeleteDialog: null,
    feedbackModalOpen: true,
    feedbackSubmitting: false,
    feedbackCategory: "ux",
    feedbackTitle: input.title,
    feedbackMessage: input.message,
    workspaceSnapshotState: { displayId: "snapshot-1" },
    savedRun: null,
    healthSummary: null,
    savingProfile: false,
  } as unknown as PlanningWorkspaceGroups["dialogs"];
  const actions = {
    setProfileDeleteDialog: vi.fn(),
    submitDeleteProfileAction: vi.fn(),
    setFeedbackCategory: vi.fn(),
    setFeedbackTitle: vi.fn(),
    setFeedbackMessage: vi.fn(),
    setFeedbackModalOpen: vi.fn(),
    submitPlanningFeedbackAction: vi.fn(),
  } as unknown as PlanningWorkspaceGroups["actions"];

  return renderToStaticMarkup(createElement(PlanningWorkspaceModalPanel, { dialogs, actions }));
}

describe("planning workspace feedback contract", () => {
  it("submits through the production-supported current-user feedback route", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/planning/workspace/useWorkspaceFeedbackSubmitAction.ts"),
      "utf8",
    );

    expect(source).toContain('fetch("/api/planning/v2/feedback"');
    expect(source).not.toContain('fetch("/api/ops/feedback/planning"');
  });

  it("labels the server-backed title and message constraints truthfully", () => {
    const html = renderFeedbackModal({ title: "", message: "" });

    expect(html).toContain("현재 사용자의 로컬 데이터 폴더에 저장됩니다");
    expect(html).not.toContain("브라우저 로컬 저장소에 안전하게 보관됩니다");
    expect(html).toContain("제목 (필수)");
    expect(html).toContain("placeholder=\"2~160자로 입력해 주세요.\"");
    expect(html).toContain("minLength=\"2\"");
    expect(html).toContain("내용 (필수)");
    expect(html).toContain("minLength=\"5\"");
  });

  it("enables save only when the title and message meet the submit validation minimums", () => {
    const invalidHtml = renderFeedbackModal({ title: "한", message: "짧음" });
    const validHtml = renderFeedbackModal({ title: "제목", message: "충분한 피드백 내용" });
    const invalidSaveButton = invalidHtml.match(/<button[^>]*>저장<\/button>/)?.[0] ?? "";
    const validSaveButton = validHtml.match(/<button[^>]*>저장<\/button>/)?.[0] ?? "";

    expect(invalidSaveButton).toContain("disabled=\"\"");
    expect(validSaveButton).not.toContain("disabled=\"\"");
  });
});
