"use client";

import { useCallback } from "react";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { type PlanningFeedbackCategory } from "@/lib/ops/feedback/planningFeedbackTypes";
import { type PlanningRunRecord } from "@/lib/planning/store/types";

type WorkspaceFeedbackSubmitActionInput = {
  feedbackCategory: PlanningFeedbackCategory;
  feedbackTitle: string;
  feedbackMessage: string;
  savedRun: PlanningRunRecord | null;
  healthSummary: {
    criticalCount?: number;
    warningCodes?: string[];
  } | null;
  workspaceSnapshotFeedbackContext: Record<string, unknown>;
  pushWorkspaceError: (message: string) => void;
  setFeedbackSubmitting: (submitting: boolean) => void;
  setFeedbackModalOpen: (open: boolean) => void;
  setFeedbackCategory: (category: PlanningFeedbackCategory) => void;
  setFeedbackTitle: (title: string) => void;
  setFeedbackMessage: (message: string) => void;
  setFeedbackToast: (message: string) => void;
};

type PlanningFeedbackCreateResponse = {
  id?: string;
};

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function useWorkspaceFeedbackSubmitAction({
  feedbackCategory,
  feedbackTitle,
  feedbackMessage,
  savedRun,
  healthSummary,
  workspaceSnapshotFeedbackContext,
  pushWorkspaceError,
  setFeedbackSubmitting,
  setFeedbackModalOpen,
  setFeedbackCategory,
  setFeedbackTitle,
  setFeedbackMessage,
  setFeedbackToast,
}: WorkspaceFeedbackSubmitActionInput): () => Promise<void> {
  return useCallback(async (): Promise<void> => {
    const title = feedbackTitle.trim();
    const message = feedbackMessage.trim();
    if (title.length < 2 || title.length > 160) {
      pushWorkspaceError("피드백 제목은 2~160자로 입력하세요.");
      return;
    }
    if (message.length < 5 || message.length > 5000) {
      pushWorkspaceError("피드백 내용은 5~5000자로 입력하세요.");
      return;
    }

    setFeedbackSubmitting(true);
    try {
      const response = await fetch("/api/planning/v2/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({
          from: { screen: "/planning" },
          context: {
            ...(Object.keys(workspaceSnapshotFeedbackContext).length > 0 ? { snapshot: workspaceSnapshotFeedbackContext } : {}),
            ...(savedRun?.id ? { runId: savedRun.id } : {}),
            ...(healthSummary ? {
              health: {
                ...(typeof healthSummary.criticalCount === "number" ? { criticalCount: healthSummary.criticalCount } : {}),
                ...(Array.isArray(healthSummary.warningCodes) ? { warningsCodes: healthSummary.warningCodes } : {}),
              },
            } : {}),
          },
          content: {
            category: feedbackCategory,
            title,
            message,
          },
        })),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        error?: { code?: string; message?: string };
        data?: PlanningFeedbackCreateResponse;
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message ?? payload?.message ?? "피드백 저장에 실패했습니다.");
      }

      const createdId = asString(payload.data?.id);
      setFeedbackModalOpen(false);
      setFeedbackCategory("ux");
      setFeedbackTitle("");
      setFeedbackMessage("");
      setFeedbackToast(createdId ? `저장됨(${createdId})` : "저장됨");
    } catch (error) {
      pushWorkspaceError(error instanceof Error ? error.message : "피드백 저장 중 오류가 발생했습니다.");
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [
    feedbackCategory,
    feedbackMessage,
    feedbackTitle,
    healthSummary,
    pushWorkspaceError,
    savedRun,
    setFeedbackCategory,
    setFeedbackMessage,
    setFeedbackModalOpen,
    setFeedbackSubmitting,
    setFeedbackTitle,
    setFeedbackToast,
    workspaceSnapshotFeedbackContext,
  ]);
}
