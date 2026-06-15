"use client";

import { useCallback, useEffect, useState } from "react";
import { type PlanningFeedbackCategory } from "@/lib/ops/feedback/planningFeedbackTypes";

type MountedRef = {
  current: boolean;
};

export type WorkspaceProfileDeleteDialogState = {
  profileId: string;
  expectedConfirm: string;
  confirmText: string;
} | null;

type WorkspaceFeedbackUiBundleInput = {
  isMountedRef: MountedRef;
};

export function useWorkspaceFeedbackUiBundle({ isMountedRef }: WorkspaceFeedbackUiBundleInput) {
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<PlanningFeedbackCategory>("ux");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackToast, setFeedbackToast] = useState("");
  const [workspaceNotice, setWorkspaceNotice] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [profileDeleteDialog, setProfileDeleteDialog] = useState<WorkspaceProfileDeleteDialogState>(null);

  const pushWorkspaceNotice = useCallback((message: string): void => {
    if (!isMountedRef.current) return;
    setWorkspaceNotice(message);
    setWorkspaceError("");
  }, [isMountedRef]);

  const pushWorkspaceError = useCallback((message: string): void => {
    if (!isMountedRef.current) return;
    setWorkspaceError(message);
    setWorkspaceNotice("");
  }, [isMountedRef]);

  useEffect(() => {
    if (!feedbackToast) return;
    const timer = window.setTimeout(() => setFeedbackToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [feedbackToast]);

  useEffect(() => {
    if (!workspaceNotice) return;
    const timer = window.setTimeout(() => setWorkspaceNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [workspaceNotice]);

  return {
    feedbackModalOpen,
    setFeedbackModalOpen,
    feedbackSubmitting,
    setFeedbackSubmitting,
    feedbackCategory,
    setFeedbackCategory,
    feedbackTitle,
    setFeedbackTitle,
    feedbackMessage,
    setFeedbackMessage,
    feedbackToast,
    setFeedbackToast,
    workspaceNotice,
    workspaceError,
    profileDeleteDialog,
    setProfileDeleteDialog,
    pushWorkspaceNotice,
    pushWorkspaceError,
  };
}
