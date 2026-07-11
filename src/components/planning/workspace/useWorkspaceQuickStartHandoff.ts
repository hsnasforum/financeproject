"use client";

import { useCallback } from "react";
import {
  hydrateProfileJsonEditorState,
  type ProfileJsonEditorState,
} from "@/app/planning/_lib/profileFormModel";
import { type PlanningWizardOutput } from "@/app/planning/_lib/planningOnboardingWizard";

type WorkspaceQuickStartHandoffInput = {
  profileName: string;
  selectedProfileId: string;
  applyHydratedProfileEditorState: (nextState: ProfileJsonEditorState, nextProfileName?: string) => void;
  clearPendingSuggestions: () => void;
  pushWorkspaceNotice: (message: string) => void;
};

export function resolveWorkspaceWizardAppliedNotice(): string {
  return "위저드 결과를 적용했습니다. 필요 시 값을 조정한 뒤 저장하세요.";
}

export function resolveWorkspaceQuickStartAppliedNotice(selectedProfileId: string): string {
  return selectedProfileId
    ? "간단 시작 입력을 적용했습니다. 현재 프로필과 편집값이 달라졌을 수 있으니 저장 여부를 먼저 확인하고 첫 실행·기록 저장으로 이어가세요."
    : "간단 시작 입력을 적용했습니다. 다음 단계는 프로필 저장이며, 저장 뒤 첫 실행·기록 저장을 거쳐 리포트를 확인할 수 있습니다.";
}

export function useWorkspaceQuickStartHandoff({
  profileName,
  selectedProfileId,
  applyHydratedProfileEditorState,
  clearPendingSuggestions,
  pushWorkspaceNotice,
}: WorkspaceQuickStartHandoffInput) {
  const applyWizardOutputAction = useCallback((output: PlanningWizardOutput): void => {
    applyHydratedProfileEditorState(hydrateProfileJsonEditorState(output.profile, profileName));
    clearPendingSuggestions();
    pushWorkspaceNotice(resolveWorkspaceWizardAppliedNotice());
  }, [applyHydratedProfileEditorState, clearPendingSuggestions, profileName, pushWorkspaceNotice]);

  const applyQuickStartAction = useCallback((output: PlanningWizardOutput): void => {
    applyHydratedProfileEditorState(hydrateProfileJsonEditorState(output.profile, profileName));
    clearPendingSuggestions();
    pushWorkspaceNotice(resolveWorkspaceQuickStartAppliedNotice(selectedProfileId));
  }, [applyHydratedProfileEditorState, clearPendingSuggestions, profileName, pushWorkspaceNotice, selectedProfileId]);

  return {
    applyWizardOutputAction,
    applyQuickStartAction,
  };
}
